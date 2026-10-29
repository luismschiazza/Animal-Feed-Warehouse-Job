// Offline smoke: built assets in a temporary dist-only directory; never boots AppModule.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'afw-dist-only-'));
try {
  fs.cpSync(path.join(root, 'dist'), path.join(temporary, 'dist'), { recursive: true });
  assert.equal(fs.existsSync(path.join(temporary, 'src')), false);
  const child = `
    const assert = require('node:assert/strict');
    assert.ok(require('node:fs').existsSync('./dist/main.js'));
    require('./dist/features/mail/helpers/handlerBars-helpers.js').registerHandlebarsHelpers();
    const {TemplateEngineProvider} = require('./dist/features/mail/providers/template-engine.provider.js');
    const {InlineCssProvider} = require('./dist/features/mail/providers/inline-css.provider.js');
    const engine = new TemplateEngineProvider(new InlineCssProvider());
    engine.render('grades/grade-released.hbs', {studentName:'Offline test',disciplineName:'Fixture',gradeValue:8})
      .then(html => {assert.ok(html.includes('<'));assert.ok(html.length > 100); assert.match(html, /style="[^"]*background-color/); console.log('PASS dist-only template and REAL CSS rendering; no DB/SMTP');})
      .catch(error => {console.error('FAIL dist-only template rendering:', error.message);process.exitCode=1;});
  `;
  execFileSync(process.execPath, ['-e', child], {
    cwd: temporary,
    // Resolve installed libraries, not application source. Docker has its own node_modules.
    env: { ...process.env, NODE_PATH: process.env.AFW_PRODUCTION_NODE_MODULES || path.join(root, 'node_modules') },
    stdio: 'inherit',
    timeout: 15000,
  });
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
