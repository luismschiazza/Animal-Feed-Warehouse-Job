export interface SendMailOptions {
  to: string | string[];
  subject: string;
  template: string;
  context?: Record<string, any>;
}
