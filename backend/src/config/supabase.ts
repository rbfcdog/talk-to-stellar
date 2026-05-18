import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isProductionLikeEnvironment } from './runtime';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseFallbackKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const supabaseKey = supabaseServiceRoleKey || (!isProductionLikeEnvironment() ? supabaseFallbackKey : undefined);

if (!supabaseUrl) {
	throw new Error('SUPABASE_URL is required. Add it to backend/.env');
}

if (!supabaseKey) {
	throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the backend. Add it to backend/.env');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
