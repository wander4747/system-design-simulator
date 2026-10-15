const SVG_NS = 'http://www.w3.org/2000/svg';

export const byId = (id) => document.getElementById(id);

/** Creates an SVG element with attributes and optionally appends it to `parent`. */
export function svg(name, attrs = {}, parent) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  parent?.appendChild(element);
  return element;
}

/** Creates an HTML element. Text goes through `textContent`, never `innerHTML`. */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  Object.assign(element, props);
  element.append(...children);
  return element;
}

export const fmt = (value) => Math.round(value).toLocaleString('pt-BR');
export const fmt1 = (value) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
