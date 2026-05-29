import { execSync } from 'child_process';
try {
  console.log(execSync('git log -n 5 --oneline').toString());
} catch(e) {
  console.log('no git', e.message);
}
