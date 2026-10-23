// Minimal XML parser tailored to Dungeon.xml.
// Unlike DOMParser/SimpleXML it keeps comments, because the dump stores
// entity names (creatures, items, actuator kinds) only in comments.
// Supported: elements, attributes, text, comments, XML declaration.
// Not supported (absent from the file): CDATA, DTD, entities other than the 5 predefined.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name]);
}

/**
 * Element node: { tag, attrs, children, text, line, endLine }
 * Comment node: { comment, line }
 * `text` is the concatenated raw text content of the element (untrimmed).
 */
export function parseXml(source) {
  const root = { tag: '#document', attrs: {}, children: [], text: '', line: 1 };
  const stack = [root];
  let pos = 0;
  let line = 1;

  const advance = (to) => {
    for (let i = pos; i < to; i++) if (source.charCodeAt(i) === 10) line++;
    pos = to;
  };

  while (pos < source.length) {
    const lt = source.indexOf('<', pos);
    if (lt === -1) break;
    if (lt > pos) stack.at(-1).text += decodeEntities(source.slice(pos, lt));
    advance(lt);

    if (source.startsWith('<!--', pos)) {
      const end = source.indexOf('-->', pos);
      if (end === -1) throw new Error(`Unclosed comment at line ${line}`);
      stack.at(-1).children.push({ comment: source.slice(pos + 4, end).trim(), line });
      advance(end + 3);
    } else if (source.startsWith('<?', pos)) {
      advance(source.indexOf('?>', pos) + 2);
    } else if (source.startsWith('</', pos)) {
      const end = source.indexOf('>', pos);
      const tag = source.slice(pos + 2, end).trim();
      const node = stack.pop();
      if (node.tag !== tag) throw new Error(`Mismatched </${tag}> at line ${line}, expected </${node.tag}>`);
      advance(end + 1);
      node.endLine = line;
    } else {
      const end = source.indexOf('>', pos);
      const raw = source.slice(pos + 1, end);
      const selfClosing = raw.endsWith('/');
      const body = selfClosing ? raw.slice(0, -1) : raw;
      const tag = body.match(/^[^\s/>]+/)[0];
      const attrs = {};
      for (const m of body.slice(tag.length).matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
        attrs[m[1]] = decodeEntities(m[2]);
      }
      const node = { tag, attrs, children: [], text: '', line, endLine: line };
      stack.at(-1).children.push(node);
      if (!selfClosing) stack.push(node);
      advance(end + 1);
      if (selfClosing) node.endLine = line;
    }
  }

  if (stack.length !== 1) throw new Error(`Unclosed <${stack.at(-1).tag}>`);
  return root.children.find((n) => n.tag);
}

// --- Navigation helpers ---------------------------------------------------

export const elements = (node, tag) =>
  node.children.filter((c) => c.tag && (tag === undefined || c.tag === tag));

export const child = (node, tag) => node.children.find((c) => c.tag === tag);

/** Text of a leaf child element, or undefined. */
export const childText = (node, tag) => child(node, tag)?.text.trim();

/** Comment written on the same line, right after the element (e.g. `<weapon …/> <!-- Torch -->`). */
export function trailingComment(parent, node) {
  const i = parent.children.indexOf(node);
  const next = parent.children[i + 1];
  return next && next.comment !== undefined && next.line === node.endLine ? next.comment : undefined;
}

