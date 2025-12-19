import fs from 'fs';
import path from 'path';

export async function downloadAttachment(url: string, ticketId: string, filename: string): Promise<string | null> {
    try {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'tickets', ticketId);

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = path.join(uploadDir, cleanFilename);
        const relativePath = `/uploads/tickets/${ticketId}/${cleanFilename}`;

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch attachment ${url}: ${response.statusText}`);
            return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(filePath, buffer);

        return relativePath;
    } catch (error) {
        console.error('Error downloading attachment:', error);
        return null;
    }
}
