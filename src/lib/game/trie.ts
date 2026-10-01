const NONE = -1;

/**
 * Compact trie stored as parallel arrays (first-child / next-sibling).
 * Keeps ~170k words in a few MB instead of hundreds of thousands of objects.
 */
export class Trie {
  readonly root = 0;
  private chars: number[] = [0];
  private firstChild: number[] = [NONE];
  private nextSibling: number[] = [NONE];
  private terminal: boolean[] = [false];
  private count = 0;

  static fromWords(words: Iterable<string>): Trie {
    const trie = new Trie();
    for (const w of words) trie.insert(w);
    return trie;
  }

  get size(): number {
    return this.count;
  }

  insert(word: string): void {
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      const code = word.charCodeAt(i);
      let next = this.child(node, code);
      if (next === NONE) {
        next = this.chars.length;
        this.chars.push(code);
        this.firstChild.push(NONE);
        this.nextSibling.push(this.firstChild[node]);
        this.terminal.push(false);
        this.firstChild[node] = next;
      }
      node = next;
    }
    if (!this.terminal[node]) {
      this.terminal[node] = true;
      this.count++;
    }
  }

  /** Returns the child node for a character code, or -1. */
  child(node: number, code: number): number {
    for (let c = this.firstChild[node]; c !== NONE; c = this.nextSibling[c]) {
      if (this.chars[c] === code) return c;
    }
    return NONE;
  }

  /** Follows every character of `text` from `node`; -1 if the path does not exist. */
  walk(node: number, text: string): number {
    let n = node;
    for (let i = 0; i < text.length && n !== NONE; i++) n = this.child(n, text.charCodeAt(i));
    return n;
  }

  isWord(node: number): boolean {
    return node !== NONE && this.terminal[node];
  }

  hasChildren(node: number): boolean {
    return node !== NONE && this.firstChild[node] !== NONE;
  }

  has(word: string): boolean {
    return this.isWord(this.walk(this.root, word));
  }
}
