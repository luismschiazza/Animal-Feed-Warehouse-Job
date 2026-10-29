import { InlineCssProvider } from './inline-css.provider';

describe('InlineCssProvider asset regression', () => {
  it('loads CSS relative to its module, independent of process.cwd(), and actually inlines it', async () => {
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue('/nonexistent-disposable-cwd');
    let provider: InlineCssProvider;
    try {
      provider = new InlineCssProvider();
    } finally {
      cwd.mockRestore();
    }
    const html = await provider.apply(
      '<html><body><h1 class="title">Offline fixture</h1></body></html>',
    );
    expect(html).toContain('Offline fixture');
    expect(html).toMatch(/style="[^"]*font-size: 20px/);
  });
});
