// A small JSON Schema (2020-12 subset) validator for action parameters, so the catalog's published
// schemas are exactly what the room enforces. Supported: type, enum, const, minimum, maximum,
// minLength, maxLength, pattern, properties, required, additionalProperties: false, items,
// minItems, maxItems, oneOf. Dependency-free on purpose (it also runs in the browser).

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

/** Returns a list of {path, message}; empty when valid. */
export function validate(schema, value, path = '') {
  const errs = [];
  const here = path || '(root)';
  if (schema.oneOf) {
    const ok = schema.oneOf.filter((s) => validate(s, value, path).length === 0);
    if (ok.length !== 1) errs.push({ path: here, message: ok.length ? 'matches more than one allowed form' : 'matches none of the allowed forms' });
    return errs;
  }
  if (schema.type) {
    const t = typeOf(value);
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const fits = types.some((x) => x === t || (x === 'number' && t === 'integer'));
    if (!fits) { errs.push({ path: here, message: `expected ${types.join('|')}` }); return errs; }
  }
  if ('const' in schema && value !== schema.const) errs.push({ path: here, message: `must equal ${JSON.stringify(schema.const)}` });
  if (schema.enum && !schema.enum.includes(value)) errs.push({ path: here, message: `must be one of ${schema.enum.map((x) => JSON.stringify(x)).join(', ')}` });
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push({ path: here, message: `must be >= ${schema.minimum}` });
    if (schema.maximum != null && value > schema.maximum) errs.push({ path: here, message: `must be <= ${schema.maximum}` });
    if (!Number.isFinite(value)) errs.push({ path: here, message: 'must be finite' });
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errs.push({ path: here, message: `length must be >= ${schema.minLength}` });
    if (schema.maxLength != null && value.length > schema.maxLength) errs.push({ path: here, message: `length must be <= ${schema.maxLength}` });
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push({ path: here, message: `must match ${schema.pattern}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push({ path: here, message: `needs >= ${schema.minItems} items` });
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push({ path: here, message: `allows <= ${schema.maxItems} items` });
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    const props = schema.properties || {};
    for (const k of schema.required || []) if (!(k in value)) errs.push({ path: path ? `${path}.${k}` : k, message: 'is required' });
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errs.push(...validate(props[k], v, path ? `${path}.${k}` : k));
      else if (schema.additionalProperties === false) errs.push({ path: path ? `${path}.${k}` : k, message: 'is not allowed' });
    }
  }
  return errs;
}
