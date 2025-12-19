module.exports = {
    apps: [{
        name: 'LAWNET-Tickets',
        script: './dist/index.js',
        cwd: '/var/www/lawnet-tickets',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '200M',
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
};
