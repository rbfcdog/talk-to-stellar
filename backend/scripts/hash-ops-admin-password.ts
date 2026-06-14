import { stdin } from 'process';
import { hashPassword } from '../src/utils/password';

async function readStdin(): Promise<string> {
  if (stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const password = String(process.env.OPS_ADMIN_PASSWORD || process.argv.slice(2).join(' ') || await readStdin());
  if (!password) {
    console.error('Usage: OPS_ADMIN_PASSWORD="<password>" npm run ops:hash-password');
    console.error('Or pipe the password on stdin. The output is the value for OPS_ADMIN_PASSWORD_HASH.');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('Ops admin password must be at least 12 characters.');
    process.exit(1);
  }

  console.log(hashPassword(password));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
