import * as handlebars from 'handlebars';

export function registerHandlebarsHelpers() {
  handlebars.registerHelper('concat', (...args) => {
    args.pop();
    return args.join('');
  });

  handlebars.registerHelper('uppercase', (str) => {
    return typeof str === 'string' ? str.toUpperCase() : str;
  });

  handlebars.registerHelper('lowercase', (str) => {
    return typeof str === 'string' ? str.toLowerCase() : str;
  });
}
