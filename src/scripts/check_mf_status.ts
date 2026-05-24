import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMissingSchemes() {
    try {
        console.log('Fetching master list from mfapi.in...');
        const response = await axios.get('https://api.mfapi.in/mf');
        const apiSchemes = response.data as any[];
        const apiSchemeCodes = new Set<number>(apiSchemes.map((s: any) => Number(s.schemeCode)));
        console.log(`API has ${apiSchemeCodes.size} schemes.`);

        console.log('Fetching stored schemes from database...');
        let allDbSchemes: any[] = [];
        let hasMore = true;
        let page = 0;
        const pageSize = 1000;

        while (hasMore) {
            const { data, error } = await supabase
                .from('mutual_funds_master')
                .select('scheme_code')
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) throw error;
            if (!data || data.length === 0) {
                hasMore = false;
            } else {
                allDbSchemes = [...allDbSchemes, ...data];
                page++;
            }
        }

        const dbSchemeCodes = new Set(allDbSchemes.map((s: any) => Number(s.scheme_code)));
        console.log(`Database has ${dbSchemeCodes.size} schemes.`);

        const missingCodes = [...apiSchemeCodes].filter(code => !dbSchemeCodes.has(code));
        console.log(`${missingCodes.length} schemes are missing from database.`);

        if (missingCodes.length > 0) {
            console.log('First 10 missing codes:', missingCodes.slice(0, 10));
        }

        // Also check how many have null ISINs
        const { count: nullIsinCount, error: countError } = await supabase
            .from('mutual_funds_master')
            .select('*', { count: 'exact', head: true })
            .is('isin', null);

        if (countError) throw countError;
        console.log(`${nullIsinCount} records in DB still have NULL ISINs.`);

    } catch (err) {
        console.error('Error:', err);
    }
}

checkMissingSchemes();
