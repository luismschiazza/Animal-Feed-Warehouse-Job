import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as inlineCss from 'inline-css';
import * as path from 'path';

@Injectable()
export class InlineCssProvider {
  private cssContent: string;

  constructor() {
    // Keep the asset next to mail code in both src (development) and dist (production).
    const cssPath = path.join(__dirname, '..', 'style', 'mail.css');

    this.cssContent = fs.readFileSync(cssPath, 'utf8');
  }

  async apply(html: string): Promise<string> {
    return (inlineCss as any)(html, {
      url: '/',
      extraCss: this.cssContent,
      removeStyleTags: false,
    });
  }
}
