import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export class SupabaseProvider {
  /**
   * Abstracted method to get the client, 
   * allows swapping implementation or adding logging later.
   */
  static getClient() {
    return supabase;
  }
}
