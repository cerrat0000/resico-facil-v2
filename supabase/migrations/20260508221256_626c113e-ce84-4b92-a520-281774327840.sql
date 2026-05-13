ALTER TABLE public.tax_calculations
  DROP CONSTRAINT IF EXISTS tax_calculations_user_id_period_year_period_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS tax_calculations_current_unique
  ON public.tax_calculations (user_id, period_year, period_month)
  WHERE is_current = true;

DROP TRIGGER IF EXISTS tax_calc_version_bump_trg ON public.tax_calculations;
CREATE TRIGGER tax_calc_version_bump_trg
  BEFORE INSERT ON public.tax_calculations
  FOR EACH ROW EXECUTE FUNCTION public.tax_calc_version_bump();