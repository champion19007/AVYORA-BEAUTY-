/**
 * Unit prices for comparison: paise per 10 ml, per 10 g or per item, from a
 * size label ("150ml", "20g", "60 Pads"). Two products are comparable only
 * in the same unit; anything else is "not comparable", never converted.
 */
export type ParsedSize = { quantity: number; unit: 'ml' | 'g' | 'item' };

export function parseSize(label: string): ParsedSize | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ml|g|patches|pads|masks?|items?|pcs)\s*$/i.exec(label);
  if (!m) return null;
  const quantity = Number(m[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const u = m[2].toLowerCase();
  return { quantity, unit: u === 'ml' ? 'ml' : u === 'g' ? 'g' : 'item' };
}

/** Integer paise per reference amount (10 ml, 10 g or 1 item), or null when the size cannot be read. */
export function unitPricePaise(pricePaise: number, sizeLabel: string): { paise: number; per: '10 ml' | '10 g' | 'item' } | null {
  const size = parseSize(sizeLabel);
  if (!size || !Number.isInteger(pricePaise) || pricePaise <= 0) return null;
  if (size.unit === 'item') return { paise: Math.round(pricePaise / size.quantity), per: 'item' };
  return { paise: Math.round((pricePaise * 10) / size.quantity), per: size.unit === 'ml' ? '10 ml' : '10 g' };
}
