import { getDatabase } from '../src/db/connection';
const context = await getDatabase();
console.log('PostgreSQL migrations applied.');
await context.close();
