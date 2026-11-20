// PM2 manages the Vite production frontend preview server on 127.0.0.1:1119.
// The FastAPI backend is managed separately via systemd (/etc/systemd/system/opcms-api.service) on 127.0.0.1:4949.
module.exports = {
  apps: [
    {
      name: 'ohb-opcms-frontend',
      script: 'npx',
      args: 'vite preview --host 127.0.0.1 --port 1119 --strictPort',
      cwd: '/opt/ohb-opcms',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
};
