// PM2 config for the Web VM. cwd must be server/ so dotenv picks up server/.env.
module.exports = {
  apps: [
    {
      name: 'ridethebus',
      script: 'index.js',
      cwd: __dirname + '/server',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
    },
  ],
};
