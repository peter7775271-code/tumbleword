#!/usr/bin/env python3
"""Boggle solver.

Usage:
    python3 boggle.py                           # uses TWL06.txt, type the grid in when prompted
    python3 boggle.py words.txt                 # use a different word list
    python3 boggle.py -g grid.txt               # read the grid from a file
    python3 boggle.py --qu                      # treat Q as the Qu tile
    python3 boggle.py --size 5 --qu             # Big Boggle (5x5) rules
    python3 boggle.py --min 3                   # include 3-letter words
"""

import argparse
import os
import sys

NEIGHBOURS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def build_trie(words):
    root = {}
    for word in words:
        node = root
        for ch in word:
            node = node.setdefault(ch, {})
        node["$"] = word
    return root


def load_words(path, min_len):
    words = set()
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            w = line.strip().upper()
            if len(w) >= min_len and w.isalpha():
                words.add(w)
    return words


def read_grid(lines, qu, size):
    rows = [line.strip().upper() for line in lines if line.strip()]
    if len(rows) != size:
        sys.exit(f"Error: expected {size} rows, got {len(rows)}")
    for r in rows:
        if len(r) != size or not r.isalpha():
            sys.exit(f"Error: bad grid row {r!r} (each row must be {size} letters)")
    return [["QU" if qu and ch == "Q" else ch for ch in row] for row in rows]


def solve(grid, trie):
    n_rows, n_cols = len(grid), len(grid[0])
    found = {}

    def dfs(r, c, node, visited, path):
        for ch in grid[r][c]:
            node = node.get(ch)
            if node is None:
                return
        path.append((r, c))
        if "$" in node and node["$"] not in found:
            found[node["$"]] = list(path)
        visited.add((r, c))
        for dr, dc in NEIGHBOURS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < n_rows and 0 <= nc < n_cols and (nr, nc) not in visited:
                dfs(nr, nc, node, visited, path)
        visited.remove((r, c))
        path.pop()

    for r in range(n_rows):
        for c in range(n_cols):
            dfs(r, c, trie, set(), [])
    return found


def score(word):
    n = len(word)
    if n <= 4:
        return 1
    return {5: 2, 6: 3, 7: 5}.get(n, 11)


def main():
    p = argparse.ArgumentParser(description="Boggle solver")
    default_list = os.path.join(os.path.dirname(os.path.abspath(__file__)), "TWL06.txt")
    p.add_argument("wordlist", nargs="?", default=default_list,
                   help="path to word list .txt, one word per line (default: TWL06.txt next to this script)")
    p.add_argument("-g", "--grid", help="file containing the grid (otherwise read from stdin)")
    p.add_argument("--size", type=int, default=4, help="grid width and height (default 4)")
    p.add_argument("--min", type=int, default=4, help="minimum word length (default 4)")
    p.add_argument("--qu", action="store_true", help="treat Q as 'QU' (standard Boggle die)")
    p.add_argument("--paths", action="store_true", help="show the cell path for each word")
    args = p.parse_args()

    if args.grid:
        with open(args.grid) as f:
            grid = read_grid(f.readlines(), args.qu, args.size)
    else:
        if sys.stdin.isatty():
            print(f"Enter the {args.size}x{args.size} grid, one row per line:")
        lines = []
        for line in sys.stdin:
            if line.strip():
                lines.append(line)
            if len(lines) == args.size:
                break
        grid = read_grid(lines, args.qu, args.size)

    trie = build_trie(load_words(args.wordlist, args.min))
    found = solve(grid, trie)

    words = sorted(found, key=lambda w: (-len(w), w))
    for w in words:
        line = f"{w:<20} {score(w):>3}"
        if args.paths:
            line += "  " + " ".join(f"({r+1},{c+1})" for r, c in found[w])
        print(line)
    print(f"\n{len(words)} words, {sum(score(w) for w in words)} points")


if __name__ == "__main__":
    main()
