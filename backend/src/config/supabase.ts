import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl) {
	throw new Error('SUPABASE_URL is required. Add it to backend/.env');
}

if (!supabaseAnonKey) {
	throw new Error('SUPABASE_ANON_KEY (or SUPABASE_KEY) is required. Add it to backend/.env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);