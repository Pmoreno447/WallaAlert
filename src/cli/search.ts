import { search } from '../wallapop/client.js';
import { parseCliArgs } from './args.js';

// Hace una búsqueda y muestra la respuesta tal cual:
//   npm run search -- 3ds --min 50 --max 100 --category 24200 --subcategory 10088
try {
  const { term, filters } = parseCliArgs(process.argv.slice(2));
  const data = await search(term || '3ds', filters);
  console.log(JSON.stringify(data, null, 2));
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
