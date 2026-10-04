<h1 align="center">Annotator Plus</h1>

<p align="center">An Obsidian-native annotation system based on <a href="https://github.com/RyotaUshio/obsidian-pdf-plus">RyotaUshio/obsidian-pdf-plus</a>, inspired by <a href="https://github.com/elias-sundqvist/obsidian-annotator">elias-sundqvist/obsidian-annotator</a>.</p>

## The idea

I annotate books and papers in Obsidian, and I tried the two plugins built for that.

[PDF++](https://github.com/RyotaUshio/obsidian-pdf-plus) is the most polished and Obsidian-native way to annotate a PDF. It uses Obsidian's own viewer, and an annotation is just a markdown link to your selection. But every annotation is a copy-and-paste: you select, copy the block, go to your note, and paste it.

[Annotator](https://github.com/elias-sundqvist/obsidian-annotator) automates that part: a note declares which file it annotates, and the annotations end up there. I loved that idea, but it uses its own viewer, and a note can point at only one file through a fixed property.

Annotator Plus is PDF++ with that one idea added. A note that links a PDF in a property of your choice receives the annotations you make in that PDF, and it can link as many files as it likes. Everything else is PDF++.

## What this fork adds

- **Annotate straight into linked notes.** Select text in a PDF and pick *Annotate*. The block is appended under a heading (default `## Annotations`) in every note that links the PDF in a property (default `up`, a single link or a list). You don't need to open the note.
- **Touch-friendly context menu.** Long-press a selection with a finger to get a flat menu with larger items. It has no hover-only submenus and no stray settings entry, and lifting your finger doesn't auto-copy.
- **Everything is a setting.** You can change the property names, which notes receive annotations, the heading, where in the section blocks go (including page order), the format, duplicate handling, excluded tags and the touch behavior.
- **Small fixes:** settings rows render properly in Obsidian 1.13 and card-style themes, and PDF links open in the current tab by default.

For everything else, see the [PDF++ documentation](https://ryotaushio.github.io/obsidian-pdf-plus/).

## Not a replacement

This fork isn't meant to replace either plugin, and it isn't going to be contributed back. PDF++ and Annotator are both great at what they do. I just had specific use cases they don't cover, so I made a version that fits the way I work. Annotator Plus patches the same parts of Obsidian as PDF++, so don't enable both at once.

## Credits and support

All the hard work here is theirs. If you find this useful, please support the original authors.

**[PDF++](https://github.com/RyotaUshio/obsidian-pdf-plus)** by [Ryota Ushio](https://github.com/RyotaUshio). This fork is built on it.

<a href="https://github.com/sponsors/RyotaUshio" target="_blank"><img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86" alt="GitHub Sponsors" style="width: 180px; height:auto;"></a>
<a href="https://www.buymeacoffee.com/ryotaushio" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="width: 180px; height:auto;"></a>
<a href="https://ko-fi.com/ryotaushio" target="_blank"><img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" alt="Ko-fi" style="width: 180px; height:auto;"></a>

**[Annotator](https://github.com/elias-sundqvist/obsidian-annotator)** by [Elias Sundqvist](https://github.com/elias-sundqvist). The note-to-file annotation idea comes from here.

<a href="https://github.com/sponsors/elias-sundqvist" target="_blank"><img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86" alt="GitHub Sponsors" style="width: 180px; height:auto;"></a>
<a href="https://www.paypal.com/donate/?hosted_button_id=C5MBC9YBWTYEC" target="_blank">Donate via PayPal</a>

Best regards and best wishes to both projects and their maintainers.

## License

MIT, like PDF++. The original copyright notice is kept in [LICENSE](LICENSE), and bundled third-party licenses are in [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).
