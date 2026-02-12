import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import db from '../database/db';
import { client } from '../index';
import { reopenTicket } from '../utils/ticketManager';
import { updatePresence } from '../utils/botUtils';
import { EmbedBuilder } from 'discord.js';

import { createServer } from 'http';
import { initSocket } from '../utils/websocket';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3003;

// Support multiple admin roles
const ADMIN_ROLE_IDS = process.env.ADMIN_ROLE_ID
    ? process.env.ADMIN_ROLE_ID.split(',').map(id => id.trim())
    : ['1451058143244189769', '1451056774789468244'];

/**
 * Check if a user has admin privileges based on Discord roles
 * @param userId Discord user ID
 * @returns Promise<boolean> Whether the user is an admin
 */
async function isAdmin(userId: string): Promise<boolean> {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return false;

        const member = await guild.members.fetch(userId);
        if (!member) return false;

        // Check if user has any of the admin roles
        return ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

// Initialize Socket.IO
initSocket(server);

// Config (should be in .env)
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_URL = process.env.REDIRECT_URI || 'https://ticket.zm0kie.de/auth/discord/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing CLIENT_ID or CLIENT_SECRET in .env');
}

// Passport Setup
passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((obj: any, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID!,
    clientSecret: CLIENT_SECRET!,
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '../../public'))); // For CSS/JS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const SQLiteStore = require('connect-sqlite3')(session);

app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: './'
    }),
    secret: 'lawnet-tickets-secret-key', // TODO: Change this
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => {
    res.redirect('/dashboard');
});

// Auth Middleware
const checkAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/auth/discord');
};

app.get('/', (req, res) => {
    res.render('index', { user: req.user });
});

app.get('/dashboard', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    let tickets: any[];

    if (isAdminUser) {
        // Admins see all tickets
        tickets = db.prepare("SELECT * FROM tickets ORDER BY created_at DESC").all();
    } else {
        // Users see only theirs
        tickets = db.prepare("SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
    }

    // Resolve Usernames (SSR)
    tickets = await Promise.all(tickets.map(async (ticket) => {
        let userName = ticket.user_id;
        let assigneeName = ticket.assigned_to;

        try {
            const user = await client.users.fetch(ticket.user_id);
            userName = user ? user.username : ticket.user_id;
        } catch (e) { /* ignore */ }

        if (ticket.assigned_to) {
            try {
                const assignee = await client.users.fetch(ticket.assigned_to);
                assigneeName = assignee ? assignee.username : ticket.assigned_to;
            } catch (e) { /* ignore */ }
        }

        return { ...ticket, user_name: userName, assignee_name: assigneeName };
    }));

    console.log(`[Dashboard] User: ${req.user.id}, Admin: ${isAdminUser}, Tickets: ${tickets.length}`);
    res.render('dashboard', { user: req.user, tickets, isAdmin: isAdminUser });
});

// API Endpoint for Polling
app.get('/api/tickets', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    let tickets: any[];

    if (isAdminUser) {
        tickets = db.prepare("SELECT * FROM tickets ORDER BY created_at DESC").all();
    } else {
        tickets = db.prepare("SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
    }

    // Resolve Usernames
    const ticketsWithNames = await Promise.all(tickets.map(async (ticket) => {
        let userName = ticket.user_id;
        let assigneeName = ticket.assigned_to;

        try {
            const user = await client.users.fetch(ticket.user_id);
            userName = user ? user.username : ticket.user_id;
        } catch (e) { /* ignore */ }

        if (ticket.assigned_to) {
            try {
                const assignee = await client.users.fetch(ticket.assigned_to);
                assigneeName = assignee ? assignee.username : ticket.assigned_to;
            } catch (e) { /* ignore */ }
        }

        return { ...ticket, user_name: userName, assignee_name: assigneeName };
    }));

    res.json({ tickets: ticketsWithNames });
});

app.get('/tickets/:id', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    const transcript = db.prepare("SELECT * FROM transcripts WHERE ticket_id = ?").get(req.params.id) as any;
    const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(req.params.id) as any;

    if (!transcript) return res.status(404).send('Transcript not found');

    // Auth Check: User must be owner OR admin
    if (ticket.user_id !== req.user.id && !isAdminUser) {
        return res.status(403).send('Unauthorized');
    }

    // Parse JSON content if available
    let messages = [];
    let legacyContent = '';

    if (transcript.json_content) {
        try {
            messages = JSON.parse(transcript.json_content);
        } catch (e) {
            console.error('Failed to parse transcript JSON', e);
        }
    }

    // Fallback or legacy HTML extraction
    const match = transcript.html_content ? transcript.html_content.match(/<body>([\s\S]*)<\/body>/) : null;
    legacyContent = match ? match[1] : transcript.html_content;


    // Format Messages
    messages = messages.map((m: any) => {
        if (m.v2_container) {
            let html = '<div class="mt-2 pl-3 border-l-4 border-indigo-500 bg-slate-800/30 rounded-r-lg p-4 max-w-2xl border border-slate-700/50">';
            const comps = m.v2_container.components || [];

            comps.forEach((section: any) => {
                if (section.type === 9 || section.type === 'SECTION') {
                    html += '<div class="mb-4 last:mb-0">';
                    (section.components || []).forEach((c: any) => {
                        if (c.type === 10 || c.type === 'TEXT_DISPLAY') {
                            const formatted = (c.content || '')
                                .replace(/\n/g, '<br>')
                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                .replace(/## (.*?)/g, '<h4 class="text-md font-bold mt-2 mb-1">$1</h4>')
                                .replace(/### (.*?)/g, '<h5 class="text-sm font-bold mt-1">$1</h5>');
                            html += `<div class="text-slate-200 text-[13px] leading-relaxed whitespace-pre-line mb-2">${formatted}</div>`;
                        }
                    });

                    if (section.accessory) {
                        const acc = section.accessory;
                        html += `<div class="mt-3"><span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded text-[11px] font-bold text-slate-300 border border-slate-600/50 uppercase tracking-wider">${acc.emoji ? `<span>${acc.emoji.name}</span>` : ''} ${acc.label}</span></div>`;
                    }
                    html += '</div>';
                }
            });
            html += '</div>';
            m.v2_html = html;
        }
        return m;
    });

    res.render('transcript', {
        id: req.params.id,
        messages,
        legacyContent,
        ticket,
        user: req.user
    });
});

app.get('/admin', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    if (!isAdminUser) return res.redirect('/dashboard');

    const totalTickets = db.prepare('SELECT COUNT(*) as count FROM tickets').get() as any;
    const openTickets = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").get() as any;
    const closedToday = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'closed' AND date(closed_at) = date('now')").get() as any;

    const allTickets = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all() as any[];

    // Fetch usernames for all tickets (owner and assignee)
    const ticketsWithUsers = await Promise.all(allTickets.map(async (t) => {
        let enhancedTicket = { ...t, username: 'Unknown User', assigned_username: null };

        try {
            const user = await client.users.fetch(t.user_id);
            enhancedTicket.username = user.username;
        } catch (e) { }

        if (t.assigned_to) {
            try {
                const assignedUser = await client.users.fetch(t.assigned_to);
                enhancedTicket.assigned_username = assignedUser.username;
            } catch (e) {
                enhancedTicket.assigned_username = t.assigned_to; // Fallback to ID
            }
        }

        return enhancedTicket;
    }));

    // Fetch all guild members for assignment dropdown (Cached)
    let guildMembers: any[] = [];

    // Simple in-memory cache
    if (!(global as any).memberCache || Date.now() - (global as any).memberCache.lastFetch > 300000) { // 5 minutes
        try {
            const guild = client.guilds.cache.first();
            if (guild) {
                const members = await guild.members.fetch();
                guildMembers = members.map(m => ({
                    id: m.id,
                    username: m.user.username,
                    displayName: m.displayName,
                    tag: m.user.tag
                })).sort((a, b) => a.displayName.localeCompare(b.displayName));

                (global as any).memberCache = {
                    data: guildMembers,
                    lastFetch: Date.now()
                };
            }
        } catch (e) {
            console.error('Failed to fetch guild members:', e);
            // Fallback to existing cache if available even if expired, otherwise empty
            if ((global as any).memberCache) {
                guildMembers = (global as any).memberCache.data;
            }
        }
    } else {
        guildMembers = (global as any).memberCache.data;
    }

    const settingsRows = db.prepare('SELECT * FROM bot_settings').all() as any[];
    const settings: any = {};
    settingsRows.forEach(s => settings[s.key] = s.value);

    res.render('admin', {
        user: req.user,
        stats: {
            total: totalTickets.count,
            open: openTickets.count,
            closedToday: closedToday.count
        },
        users: guildMembers,
        tickets: ticketsWithUsers,
        settings,
        isAdmin: isAdminUser
    });
});

app.delete('/api/tickets/:id', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    if (!isAdminUser) return res.status(403).json({ error: 'Nur Administratoren dürfen Tickets löschen.' });

    try {
        const ticket = db.prepare('SELECT channel_id FROM tickets WHERE id = ?').get(req.params.id) as any;
        if (ticket) {
            // Delete Discord thread if it exists
            try {
                const thread = await client.channels.fetch(ticket.channel_id);
                if (thread) await thread.delete();
            } catch (e) { }
        }

        db.prepare('DELETE FROM transcripts WHERE ticket_id = ?').run(req.params.id);
        db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bot/settings', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    if (!isAdminUser) return res.status(403).json({ error: 'Nur Administratoren dürfen Einstellungen ändern.' });

    const { key, value } = req.body;
    db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)').run(key, value);

    if (key.startsWith('bot_')) {
        updatePresence(client);
    }

    res.json({ success: true });
});

app.post('/api/tickets/:id/reopen', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    if (!isAdminUser) return res.status(403).json({ error: 'Nur Administratoren können Tickets erneut öffnen.' });

    try {
        const threadId = await reopenTicket(client, req.params.id, req.user);
        res.json({ success: true, threadId });
    } catch (err: any) {
        console.error('Re-open error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets/:id/close', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    if (!isAdminUser) return res.status(403).json({ error: 'Nur Administratoren können Tickets schließen.' });

    try {
        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id) as any;
        if (!ticket) return res.status(404).json({ error: 'Ticket nicht gefunden.' });
        if (ticket.status === 'closed') return res.status(400).json({ error: 'Ticket ist bereits geschlossen.' });

        const thread = await client.channels.fetch(ticket.channel_id);
        if (thread && thread.isThread()) {
            // Simulate interaction object for handleCloseTicket
            const mockInteraction = {
                channel: thread,
                reply: async (msg: any) => { await thread.send(msg.content || msg); },
                user: { id: req.user.id, tag: req.user.username }
            };

            const { handleCloseTicket } = await import('../utils/ticketManager');
            await handleCloseTicket(mockInteraction as any);
        }

        res.json({ success: true });
    } catch (err: any) {
        console.error('Close ticket error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Assign ticket to supporter
app.post('/api/tickets/:id/assign', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    const { supporterId, supporterName } = req.body;

    // Supporters can only assign to themselves, admins can assign to anyone
    if (!isAdminUser && supporterId && supporterId !== req.user.id) {
        return res.status(403).json({ error: 'Du kannst Tickets nur dir selbst zuweisen.' });
    }

    try {
        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id) as any;
        if (!ticket) return res.status(404).json({ error: 'Ticket nicht gefunden.' });

        // Update assignment
        if (supporterId) {
            db.prepare('UPDATE tickets SET assigned_to = ? WHERE id = ?').run(supporterId, req.params.id);
        } else {
            // Unassign
            db.prepare('UPDATE tickets SET assigned_to = NULL WHERE id = ?').run(req.params.id);
        }

        // Post notification in Discord thread
        try {
            const thread = await client.channels.fetch(ticket.channel_id);
            if (thread && thread.isThread()) {
                if (supporterId) {
                    // Add user to thread
                    try {
                        await thread.members.add(supporterId);
                    } catch (e) {
                        console.error('Failed to add member to thread on assign:', e);
                    }

                    try {
                        const embed = new EmbedBuilder()
                            .setTitle('🎯 Ticket übernommen')
                            .setDescription(`<@${supporterId}> hat dieses Ticket übernommen und wird sich um dein Anliegen kümmern.`)
                            .setColor(0xF59E0B) // Amber color
                            .setTimestamp();

                        await thread.send({ embeds: [embed] });
                    } catch (embedError) {
                        console.error('Failed to send assignment embed:', embedError);
                        await thread.send(`🎯 **Ticket übernommen!**\n<@${supporterId}> hat dieses Ticket übernommen und wird sich um dein Anliegen kümmern.`);
                    }
                } else {
                    // Unassign notification
                    try {
                        const embed = new EmbedBuilder()
                            .setTitle('⚠️ Zuweisung aufgehoben')
                            .setDescription('Das Ticket ist nun wieder für alle Supporter offen.')
                            .setColor(0xEF4444) // Red color
                            .setTimestamp();
                        await thread.send({ embeds: [embed] });
                    } catch (unassignError) {
                        await thread.send(`⚠️ **Zuweisung aufgehoben**\nDas Ticket ist nun wieder für alle Supporter offen.`);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to post assignment notification:', e);
        }

        res.json({ success: true });
    } catch (err: any) {
        console.error('Assignment error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Rename thread
app.post('/api/tickets/:id/rename', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    if (!isAdminUser) return res.status(403).json({ error: 'Nur Administratoren können Threads umbenennen.' });

    const { newName } = req.body;
    if (!newName || newName.trim().length === 0) {
        return res.status(400).json({ error: 'Name darf nicht leer sein.' });
    }

    try {
        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id) as any;
        if (!ticket) return res.status(404).json({ error: 'Ticket nicht gefunden.' });

        // Update thread name in Discord
        const thread = await client.channels.fetch(ticket.channel_id);
        if (thread && thread.isThread()) {
            await thread.setName(newName.trim());
        }

        // Update in database
        db.prepare('UPDATE tickets SET thread_name = ? WHERE id = ?').run(newName.trim(), req.params.id);

        res.json({ success: true });
    } catch (err: any) {
        console.error('Rename error:', err);
        res.status(500).json({ error: err.message });
    }
});

// View Live Transcript
app.get('/api/tickets/:id/transcript', checkAuth, async (req: any, res) => {
    console.log(`[DEBUG-ID-${req.params.id}] GET transcript request received`);
    try {
        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id) as any;
        if (!ticket) {
            console.log(`[DEBUG-ID-${req.params.id}] Ticket not found in DB`);
            return res.status(404).send('Ticket nicht gefunden');
        }

        const { client } = await import('../index');
        const channel = await client.channels.fetch(ticket.channel_id);
        if (!channel || !channel.isThread()) {
            console.log(`[DEBUG-ID-${req.params.id}] Channel/Thread not found or invalid: ${ticket.channel_id}`);
            return res.status(404).send('Discord Thread nicht gefunden');
        }

        const { generateTranscript } = await import('../utils/ticketManager');
        console.log(`[DEBUG-ID-${req.params.id}] Calling generateTranscript...`);
        const { htmlContent } = await generateTranscript(channel, ticket);
        console.log(`[DEBUG-ID-${req.params.id}] Transcript generated, length: ${htmlContent.length}`);

        res.send(htmlContent);
    } catch (err: any) {
        console.error('Transcript error:', err);
        res.status(500).send('Fehler beim Generieren des Transkripts: ' + err.message);
    }
});

// Update tags
app.post('/api/tickets/:id/tags', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    if (!isAdminUser) return res.status(403).json({ error: 'Nur Administratoren können Tags bearbeiten.' });

    const { tags } = req.body;
    if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags müssen ein Array sein.' });
    }

    try {
        db.prepare('UPDATE tickets SET tags = ? WHERE id = ?').run(JSON.stringify(tags), req.params.id);
        res.json({ success: true });
    } catch (err: any) {
        console.error('Tags error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add supporter to ticket
app.post('/api/tickets/:id/add-supporter', checkAuth, async (req: any, res) => {
    const isAdminUser = await isAdmin(req.user.id);
    if (!isAdminUser) return res.status(403).json({ error: 'Nur Administratoren können Supporter hinzufügen.' });

    const { supporterId, supporterName } = req.body;

    try {
        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id) as any;
        if (!ticket) return res.status(404).json({ error: 'Ticket nicht gefunden.' });

        let supporters = [];
        if (ticket.supporters) {
            try {
                supporters = JSON.parse(ticket.supporters);
            } catch (e) { }
        }

        if (!supporters.includes(supporterId)) {
            supporters.push(supporterId);
            db.prepare('UPDATE tickets SET supporters = ? WHERE id = ?').run(JSON.stringify(supporters), req.params.id);

            // Notify in thread
            try {
                const thread = await client.channels.fetch(ticket.channel_id);
                if (thread && thread.isThread()) {
                    try {
                        await thread.members.add(supporterId);
                    } catch (memberErr) {
                        console.error('Failed to add member to thread (might already be there):', memberErr);
                    }

                    try {
                        const embed = new EmbedBuilder()
                            .setTitle('👋 Supporter hinzugefügt')
                            .setDescription(`<@${supporterId}> wurde hinzugefügt.`)
                            .setColor(0x3B82F6) // Blue color
                            .setTimestamp();

                        await thread.send({ embeds: [embed] });
                    } catch (sendErr) {
                        console.error('Failed to send add supporter embed:', sendErr);
                    }
                }
            } catch (e) {
                console.error('Failed to add supporter to thread:', e);
            }
        }

        res.json({ success: true });
    } catch (err: any) {
        console.error('Add supporter error:', err);
        res.status(500).json({ error: err.message });
    }
});


app.get('/logout', (req: any, res) => {
    req.logout(() => res.redirect('/'));
});

// Start Server
export const startDashboard = () => {
    server.listen(PORT, () => {
        console.log(`Dashboard running on http://localhost:${PORT}`);
    });
};
