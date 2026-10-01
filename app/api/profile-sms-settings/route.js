import legacyHandler from '../../../legacy-api/profile-sms-settings.js';
import { runLegacy } from '../../../lib/legacy-adapter.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request){ return runLegacy(legacyHandler, request); }
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
