#!/usr/bin/env python3
"""check_docs.py - gate determinístico de integridade do ecossistema de docs.

Verifica, sem rede e sem dependências externas:

  ERROR broken-link  - link relativo em um .md aponta para arquivo inexistente
  ERROR orphan       - arquivo sob docs/ não alcançável a partir das raízes
                       de navegação via grafo de links

Escopo (spec .specs/features/docs-planning-ecosystem/spec.md, PLAN-11..13):
  - arquivos verificados: README.md, AGENTS.md e todo *.md sob docs/;
  - raízes do grafo de alcançabilidade: README.md, AGENTS.md e
    docs/00-overview/00-index.md;
  - âncoras (`file.md#secao`) validam apenas a parte do arquivo;
  - URLs externas (http/https/mailto) são ignoradas;
  - alvos não-Markdown (ex.: examples/*.yaml) também têm existência checada.

Uso:
  python3 scripts/check_docs.py [--root DIR]

Exit: 0 íntegro, 1 problemas encontrados, 2 erro de uso.
"""

import argparse
import os
import re
import sys

LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)\)")
EXTERNAL_RE = re.compile(r"^(https?:|mailto:|#)")

ROOTS = ["README.md", "AGENTS.md", os.path.join("docs", "00-overview", "00-index.md")]


def md_files(root):
    files = [p for p in ("README.md", "AGENTS.md") if os.path.isfile(os.path.join(root, p))]
    for dirpath, _dirnames, filenames in os.walk(os.path.join(root, "docs")):
        for name in sorted(filenames):
            if name.endswith(".md"):
                files.append(os.path.relpath(os.path.join(dirpath, name), root))
    return files


def links_of(root, relpath):
    with open(os.path.join(root, relpath), "r", encoding="utf-8") as f:
        text = f.read()
    # remove blocos de código cercados para não ler exemplos como links
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    out = []
    for target in LINK_RE.findall(text):
        if EXTERNAL_RE.match(target):
            continue
        target = target.split("#", 1)[0]
        if not target:
            continue
        resolved = os.path.normpath(os.path.join(os.path.dirname(relpath), target))
        out.append((target, resolved))
    return out


def main(argv=None):
    p = argparse.ArgumentParser(prog="check_docs.py")
    p.add_argument("--root", default=".")
    args = p.parse_args(argv)
    root = args.root
    if not os.path.isdir(os.path.join(root, "docs")):
        print("check_docs: docs/ não encontrado sob --root", file=sys.stderr)
        return 2

    files = md_files(root)
    errors = []

    # 1. Links quebrados em qualquer arquivo do escopo.
    graph = {}
    for rel in files:
        targets = links_of(root, rel)
        graph[rel] = [resolved for _raw, resolved in targets]
        for raw, resolved in targets:
            if not os.path.isfile(os.path.join(root, resolved)):
                errors.append(f"broken-link {rel}: '{raw}' -> {resolved} não existe")

    # 2. Alcançabilidade: todo docs/**.md deve ser atingível das raízes.
    reachable, stack = set(), [r for r in ROOTS if r in graph]
    while stack:
        cur = stack.pop()
        if cur in reachable:
            continue
        reachable.add(cur)
        for nxt in graph.get(cur, []):
            if nxt in graph and nxt not in reachable:
                stack.append(nxt)
    for rel in files:
        if rel.startswith("docs" + os.sep) and rel not in reachable:
            errors.append(f"orphan {rel}: não alcançável a partir de {', '.join(ROOTS)}")

    for e in errors:
        print(f"  ERROR {e}")
    print(f"check_docs: {len(errors)} problema(s) em {len(files)} arquivo(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
