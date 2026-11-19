module.exports = {
  apps: [
    {
      name: 'ohb-opcms-frontend',
      script: 'npx',
      args: 'vite preview --host 127.0.0.1 --port 3000 --strictPort',
      cwd: '/opt/ohb-opcms',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      name: 'ohb-opcms-backend',
      script: '/opt/ohb-opcms/backend/.venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 4949 --workers 1',
      cwd: '/opt/ohb-opcms/backend',
      interpreter: 'none',
      env: {
        ENVIRONMENT: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
    },
  ],
};
