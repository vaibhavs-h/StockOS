import { RefreshTier } from '../core/types';

/**
 * VERY IMPORTANT: COLUMN-LEVEL REFRESH STRATEGY
 * These arrays dictate EXACTLY which columns each refresh tier is allowed to touch.
 * This guarantees Yahoo Finance anti-throttling by ensuring high-frequency live 
 * updates never trigger deep fundamental modules.
 */
export const COLUMN_TIERS: Record<RefreshTier, string[]> = {
  [RefreshTier.TIER_1_HOT]: [
    'current_price', 'day_change', 'day_change_percentage', 'regularmarketdayhigh', 
    'regularmarketdaylow', 'volume', 'average_volume', 'bid', 'ask', 'bid_size', 'ask_size',
    'premarket_price', 'premarket_change', 'premarket_change_pct', 'premarket_volume',
    'after_hours_price', 'after_hours_change', 'after_hours_change_pct', 'after_hours_volume',
    'market_status', 'traded_value', 'vwap'
  ],
  [RefreshTier.TIER_2_ACTIVE]: [
    'market_cap', 'pe_ratio', 'forward_pe', 'eps_trailing', 'eps_forward', 'price_to_book',
    'beta_5y', 'fifty_day_average', 'two_hundred_day_average', 'fifty_two_week_high',
    'fifty_two_week_low', 'fifty_two_week_change_pct', 'average_daily_volume_10d',
    'average_volume_3m', 'dividend_yield', 'trailing_annual_dividend_rate',
    'trailing_annual_dividend_yield', 'market_cap_category', 'shares_outstanding', 'float_shares'
  ],
  [RefreshTier.TIER_3_EXTENDED]: [
    'recommendation_key', 'recommendation_mean', 'number_of_analyst_opinions', 'target_price',
    'target_high_price', 'target_low_price', 'target_mean_price', 'target_median_price',
    'recommendation_score', 'held_percent_insiders', 'held_percent_institutions',
    'revenue_growth', 'earnings_growth', 'revenue_quarterly_growth', 'earnings_quarterly_growth',
    'profit_margins', 'operating_margins', 'gross_margins', 'ebitda_margins', 'gross_profits',
    'ebitda', 'enterprise_value', 'total_revenue', 'revenue_per_share', 'operating_cashflow',
    'free_cashflow', 'total_cash', 'total_cash_per_share', 'total_debt', 'debt_to_equity',
    'current_ratio', 'quick_ratio', 'return_on_assets', 'return_on_equity', 'payout_ratio',
    'peg_ratio', 'ps_ratio', 'ev_ebitda', 'ev_revenue', 'revenue_ttm', 'net_income_ttm',
    'gross_profit_ttm', 'operating_income_ttm', 'diluted_eps_ttm', 'capex_ttm', 'retained_earnings',
    'shareholder_equity', 'working_capital', 'roa', 'roce', 'interest_coverage', 'operating_margin',
    'net_margin', 'gross_margin', 'revenue_growth_yoy', 'earnings_growth_yoy', 'eps_growth_3y_cagr',
    'fcf_growth_yoy', 'promoter_holding', 'pledged_shares_pct', 'fii_holding', 'dii_holding',
    'mutual_fund_holding', 'public_holding', 'quarterly_earnings_history', 'earnings_timestamp',
    'earnings_timestamp_start', 'earnings_timestamp_end', 'earnings_call_timestamp_start',
    'earnings_call_timestamp_end', 'next_earnings_date', 'last_earnings_surprise_pct',
    'est_eps_next_quarter', 'actual_eps_last_quarter'
  ],
  [RefreshTier.TIER_4_DAILY]: [
    'top_institutional_holders', 'top_mutual_fund_holders', 'major_holders_breakdown',
    'insider_transactions', 'sec_filings', 'sec_filing_url', 'latest_10k_date', 'latest_10q_date',
    'ex_dividend_date', 'dividend_rate', 'five_year_avg_dividend_yield', 'last_split_factor',
    'last_split_date', 'last_dividend_amount', 'last_dividend_date', 'dividend_history',
    'delivery_percentage', 'turnover_last_30d', 'upper_circuit', 'lower_circuit', 'lot_size',
    'ath', 'atl', 'ath_date', 'atl_date', 'fifty_two_week_high_date', 'fifty_two_week_low_date',
    'all_time_high', 'all_time_low', 'all_time_high_date', 'all_time_low_date', 'ma_20',
    'return_1m', 'return_1y', 'book_value', 'book_value_per_share', 'cash_on_hand'
  ],
  [RefreshTier.TIER_5_STATIC]: [
    'symbol', 'name', 'sector', 'industry', 'industry_key', 'sector_key', 'description',
    'long_business_summary', 'website', 'ir_website', 'ceo_name', 'company_officers',
    'full_time_employees', 'founded_year', 'address1', 'city', 'state', 'zip', 'country',
    'headquarters_city', 'phone', 'currency', 'exchange', 'primary_exchange', 'exchange_timezone',
    'market_region', 'market_state', 'quote_type', 'is_esg_popular', 'is_sp500', 'is_nasdaq100',
    'is_dow30', 'cik', 'audit_risk', 'board_risk', 'compensation_risk', 'shareholder_rights_risk',
    'overall_risk', 'tags', 'themes'
  ]
};
