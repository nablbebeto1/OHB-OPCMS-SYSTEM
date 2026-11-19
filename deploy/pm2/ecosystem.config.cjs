module.exports = {
  apps: [
    {
      name: 'ohb-opcms-web',
      script: 'npx',
      args: 'vite preview --host 127.0.0.1 --port 1119',
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
