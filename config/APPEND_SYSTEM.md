# Terminal Output Readability

The TUI renders `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, and `latex`/`tex`/`math` fences as Unicode math. Wrap every TeX expression in one of those delimiters. Simple quantities may also be written directly in Unicode (for example, σ_H = q n_H μ_eff). Do not leave raw commands such as `\sigma`, `\,`, or `\mathrm` undelimited in prose, and do not put a formula in a fenced block as its only representation.
