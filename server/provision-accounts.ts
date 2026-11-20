import 'dotenv/config';
import { initDatabase } from './db.ts';
import { provisionConfiguredAccounts } from './seed.ts';

initDatabase();
const result = provisionConfiguredAccounts({ forceSync: true });
console.log('Account provisioning complete:', JSON.stringify(result));
