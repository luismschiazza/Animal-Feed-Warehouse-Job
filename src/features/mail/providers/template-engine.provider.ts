import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import * as path from 'path';
import { InlineCssProvider } from './inline-css.provider';

@Injectable()
export class TemplateEngineProvider {
  private readonly templatesBasePath: string;

  constructor(private inlineCss: InlineCssProvider) {
    this.templatesBasePath = path.join(process.cwd(), 'src', 'features', 'mail', 'templates');

    this.registerSharedPartials();
  }

  private registerSharedPartials() {
    const sharedDir = path.join(this.templatesBasePath, 'shared');

    if (!fs.existsSync(sharedDir)) {
      return;
    }

    const files = fs.readdirSync(sharedDir);

    for (const file of files) {
      if (!file.endsWith('.hbs')) {
        continue;
      }

      const filePath = path.join(sharedDir, file);
      const name = path.basename(file, '.hbs'); // ex school-layout

      const content = fs.readFileSync(filePath, 'utf-8');
      handlebars.registerPartial(name, content);
    }
  }

  async render(templateRelativePath: string, context: Record<string, any> = {}): Promise<string> {
    const templatePath = path.join(this.templatesBasePath, templateRelativePath);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    const file = fs.readFileSync(templatePath, 'utf-8');
    const compiled = handlebars.compile(file);

    const defaultContext = {
      year: new Date().getFullYear(),
      appName: process.env.MAIL_FROM,
    };

    const html = compiled({
      ...defaultContext,
      ...context,
    });

    return this.inlineCss.apply(html);
  }
}
