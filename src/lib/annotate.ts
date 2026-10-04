import { MarkdownView, Notice, TFile, getAllTags, getLinkpath, parseLinktext } from 'obsidian';

import { PDFPlusLibSubmodule } from './submodule';
import { PDFViewerChild } from 'typings';
import { diffInsertion, insertUnderHeading } from 'utils/insert-under-heading';
import { subpathToParams } from 'utils';


export interface AnnotationSource {
    child: PDFViewerChild;
    /** The PDF file. */
    file: TFile;
    page: number;
    /** e.g. `#page=3&selection=1,2,3,4&color=yellow` */
    subpath: string;
    text: string;
    /** The value of the `{{color}}` template variable. */
    colorName: string;
    copyFormat: string;
    displayTextFormat?: string;
    comment?: string;
    /** If true, `copyFormat` was chosen explicitly (e.g. from the context menu) and the "Annotation format" setting is not applied. */
    explicitFormat?: boolean;
}

type InsertResult = 'added' | 'duplicate' | 'no-heading';


/**
 * Annotator Plus: adds annotation blocks to the notes that link to a PDF via a frontmatter property (e.g. `up`).
 */
export class AnnotateLib extends PDFPlusLibSubmodule {
    statusDurationMs = 2500;

    getPropertyNames(): string[] {
        return this.settings.annotationProperties
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name);
    }

    /** Whether a frontmatter link key (`up`, `up.0`, `up.1`, ...) belongs to one of the given properties. */
    private keyMatches(key: string, properties: string[]) {
        const lower = key.toLowerCase();
        return properties.some((property) => {
            const p = property.toLowerCase();
            return lower === p || lower.startsWith(p + '.');
        });
    }

    private resolveLink(link: string, sourcePath: string) {
        const { path } = parseLinktext(link);
        return this.app.metadataCache.getFirstLinkpathDest(getLinkpath(path), sourcePath);
    }

    /** Returns true if the given note links to `pdf` from one of the annotation properties. */
    noteLinksToPDF(note: TFile, pdf: TFile, properties = this.getPropertyNames()): boolean {
        const cache = this.app.metadataCache.getFileCache(note);
        if (!cache) return false;

        // Wikilinks and markdown links, e.g. `up: "[[Book.pdf]]"`
        for (const link of cache.frontmatterLinks ?? []) {
            if (this.keyMatches(link.key, properties) && this.resolveLink(link.link, note.path) === pdf) {
                return true;
            }
        }

        // Plain paths, e.g. `up: Attachments/Book.pdf`
        const frontmatter = cache.frontmatter;
        if (frontmatter) {
            for (const [key, value] of Object.entries(frontmatter)) {
                if (!this.keyMatches(key, properties)) continue;
                const values = Array.isArray(value) ? value : [value];
                for (const v of values) {
                    if (typeof v === 'string' && v && !v.includes('[[') && this.resolveLink(v.trim(), note.path) === pdf) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /** Whether the note carries one of the tags (or a nested tag under one) in the "exclude tags" setting. */
    isExcluded(note: TFile): boolean {
        const excluded = this.settings.annotationExcludeTags
            .split(',')
            .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
            .filter((tag) => tag);
        if (!excluded.length) return false;

        const cache = this.app.metadataCache.getFileCache(note);
        const tags = (cache ? getAllTags(cache) ?? [] : []).map((tag) => tag.replace(/^#/, '').toLowerCase());
        return tags.some((tag) => excluded.some((ex) => tag === ex || tag.startsWith(ex + '/')));
    }

    /** All markdown notes that link to `pdf` from one of the annotation properties. */
    getLinkedNotes(pdf: TFile): TFile[] {
        const properties = this.getPropertyNames();
        if (!properties.length) return [];

        return this.app.vault.getMarkdownFiles()
            .filter((note) => this.noteLinksToPDF(note, pdf, properties) && !this.isExcluded(note))
            .sort((a, b) => a.path.localeCompare(b.path));
    }

    /** Markdown files ordered from the most recently opened. */
    private getRecentMarkdownFiles(): TFile[] {
        const paths: string[] = [];
        const lastActive = this.plugin.lastActiveMarkdownFile;
        if (lastActive) paths.push(lastActive.path);
        paths.push(...this.app.workspace.getLastOpenFiles());

        const files: TFile[] = [];
        for (const path of paths) {
            const file = this.app.vault.getFileByPath(path);
            if (file && file.extension === 'md' && !files.includes(file)) files.push(file);
        }
        return files;
    }

    /** The notes that a new annotation for `pdf` will be added to, according to the settings. */
    getTargets(pdf: TFile): { targets: TFile[], isFallback: boolean } {
        let targets: TFile[] = [];

        if (this.settings.annotationTarget === 'last-active') {
            const file = this.plugin.lastActiveMarkdownFile;
            if (file && !this.isExcluded(file)) targets = [file];
        } else {
            const linked = this.getLinkedNotes(pdf);
            if (this.settings.annotationTarget === 'last-active-linked' && linked.length > 1) {
                const recent = this.getRecentMarkdownFiles().find((file) => linked.includes(file));
                const latest = recent ?? linked.reduce((a, b) => (b.stat.mtime > a.stat.mtime ? b : a));
                targets = [latest];
            } else {
                targets = linked;
            }
        }

        if (!targets.length && this.settings.annotationFallback === 'last-active') {
            const file = this.plugin.lastActiveMarkdownFile;
            if (file && !this.isExcluded(file)) return { targets: [file], isFallback: true };
        }

        return { targets, isFallback: false };
    }

    /** A short human-readable description of where an annotation for `pdf` will go. Used in the context menu. */
    describeTargets(pdf: TFile): string | null {
        const { targets } = this.getTargets(pdf);
        if (!targets.length) return null;
        if (targets.length === 1) return targets[0].basename;
        return `${targets.length} notes`;
    }

    /** The copy format (template) to use, taking the "Annotation format" setting into account. */
    resolveCopyFormat(copyFormat: string, explicit?: boolean) {
        if (explicit) return copyFormat;
        const name = this.settings.annotationCopyFormat;
        if (!name) return copyFormat;
        return this.settings.copyCommands.find((command) => command.name === name)?.template ?? copyFormat;
    }

    /** A string that identifies the annotated region, used to detect duplicates. */
    private getDuplicateKey(source: AnnotationSource) {
        const params = subpathToParams(source.subpath);
        const selection = params.get('selection');
        if (selection) return `page=${source.page}&selection=${selection}`;
        const annotation = params.get('annotation');
        if (annotation) return `page=${source.page}&annotation=${annotation}`;
        return null;
    }

    private mentionsPDF(text: string, pdf: TFile) {
        return text.includes(pdf.basename) || text.includes(encodeURI(pdf.basename));
    }

    private getPageOfBlock(block: string, pdf: TFile): number | null {
        if (!this.mentionsPDF(block, pdf)) return null;
        const match = block.match(/[#&]page=(\d+)/);
        return match ? +match[1] : null;
    }

    private computeNewData(data: string, block: string, source: AnnotationSource): { data: string, line: number } | InsertResult {
        if (this.settings.annotationSkipDuplicates) {
            const key = this.getDuplicateKey(source);
            if (key && data.includes(key) && this.mentionsPDF(data, source.file)) {
                return 'duplicate';
            }
        }

        const result = insertUnderHeading(data, block, {
            heading: this.settings.annotationHeading,
            createHeading: this.settings.annotationCreateHeading,
            position: this.settings.annotationInsertPosition,
            blankLineBetweenBlocks: this.settings.annotationBlankLineBetweenBlocks,
            page: source.page,
            getPageOfBlock: (b) => this.getPageOfBlock(b, source.file),
        });
        if (!result) return 'no-heading';
        return result;
    }

    private async insertIntoNote(note: TFile, block: string, source: AnnotationSource): Promise<InsertResult> {
        const leaf = this.lib.workspace.getExistingLeafForMarkdownFile(note);
        const view = leaf?.view instanceof MarkdownView ? leaf.view : null;

        // If the note is open in the editing view, go through the editor so that
        // unsaved changes, the cursor position and the undo history are preserved.
        if (view && view.getMode() === 'source') {
            const editor = view.editor;
            const oldData = editor.getValue();
            const computed = this.computeNewData(oldData, block, source);
            if (typeof computed === 'string') return computed;

            const insertion = diffInsertion(oldData, computed.data);
            if (insertion) {
                editor.replaceRange(insertion.text, editor.offsetToPos(insertion.offset));
            } else {
                editor.setValue(computed.data);
            }
            view.save();

            if (this.settings.annotationScrollOpenNotes) {
                const pos = { line: computed.line, ch: 0 };
                editor.scrollIntoView({ from: pos, to: pos }, true);
            }
            return 'added';
        }

        let result: InsertResult = 'added';
        let line = 0;
        await this.app.vault.process(note, (data) => {
            const computed = this.computeNewData(data, block, source);
            if (typeof computed === 'string') {
                result = computed;
                return data;
            }
            line = computed.line;
            return computed.data;
        });

        if (result === 'added' && view && this.settings.annotationScrollOpenNotes) {
            activeWindow.setTimeout(() => {
                // @ts-ignore
                view.currentMode?.applyScroll?.(line);
            }, 200);
        }

        return result;
    }

    /**
     * Add an annotation block to the target notes.
     * @returns true if the annotation has been handled (so the caller should not copy the link to the clipboard),
     * false if the caller should fall back to copying.
     */
    async annotate(source: AnnotationSource): Promise<boolean> {
        const { child, file, page, subpath, text, colorName, displayTextFormat, comment } = source;
        const palette = this.lib.getColorPaletteFromChild(child);
        const copyFormat = this.resolveCopyFormat(source.copyFormat, source.explicitFormat);

        const { targets, isFallback } = this.getTargets(file);

        if (!targets.length) {
            const properties = this.getPropertyNames().map((p) => `"${p}"`).join(' or ') || '(no property set)';
            if (this.settings.annotationFallback === 'clipboard') {
                palette?.setStatus('No linked note found; copying link instead', this.statusDurationMs);
                return false;
            }
            palette?.setStatus('No linked note found', this.statusDurationMs);
            new Notice(`${this.plugin.manifest.name}: No note links to "${file.name}" in ${properties}. Nothing was added.`);
            return true;
        }

        const results = new Map<TFile, InsertResult>();
        for (const note of targets) {
            try {
                let block = this.lib.copyLink.getTextToCopy(child, copyFormat, displayTextFormat, file, page, subpath, text, colorName, note.path, comment);
                if (this.settings.annotationTrimEmptyQuoteLines) {
                    block = block.replace(/(\n[ \t]*>[ \t>]*)+\s*$/, '');
                }
                results.set(note, await this.insertIntoNote(note, block, source));
            } catch (err) {
                console.error(err);
                new Notice(`${this.plugin.manifest.name}: Failed to add the annotation to "${note.basename}": ${err.message}`);
            }
        }

        if (this.settings.annotationAlsoCopy) {
            const evaluated = this.lib.copyLink.getTextToCopy(child, copyFormat, displayTextFormat, file, page, subpath, text, colorName, undefined, comment);
            await navigator.clipboard.writeText(evaluated);
            this.lib.copyLink.onCopyFinish(evaluated);
        }

        const added = targets.filter((note) => results.get(note) === 'added');
        const duplicates = targets.filter((note) => results.get(note) === 'duplicate');
        const noHeading = targets.filter((note) => results.get(note) === 'no-heading');

        let message: string;
        if (added.length) {
            message = added.length === 1 ? `Added to "${added[0].basename}"` : `Added to ${added.length} notes`;
            if (isFallback) message += ' (last active note)';
        } else if (duplicates.length) {
            message = 'Already annotated';
        } else {
            message = 'Nothing was added';
        }
        palette?.setStatus(message, this.statusDurationMs);

        if (this.settings.annotationShowNotice || noHeading.length) {
            const lines = [`${this.plugin.manifest.name}: ${message}.`];
            if (added.length > 1) lines.push(...added.map((note) => `- ${note.basename}`));
            if (duplicates.length && added.length) lines.push(`Already present in: ${duplicates.map((note) => note.basename).join(', ')}`);
            if (noHeading.length) lines.push(`Skipped (no "${this.settings.annotationHeading}" heading): ${noHeading.map((note) => note.basename).join(', ')}`);
            new Notice(lines.join('\n'), 3000);
        }

        if (added.length && this.settings.annotationClearSelection) {
            const selection = child.containerEl.win.getSelection();
            if (selection && this.lib.copyLink.getPageAndTextRangeFromSelection(selection)) {
                selection.empty();
            }
        }

        return true;
    }

    /**
     * Annotate the current text selection: writes a highlight into the PDF first if PDF editing is turned on in the color palette,
     * then adds the annotation block to the linked notes.
     */
    annotateSelection(checking: boolean, templates?: { copyFormat: string, displayTextFormat?: string }, colorName?: string | null): boolean {
        const palette = this.lib.getColorPaletteAssociatedWithSelection();
        if (!palette) return false;

        const explicitFormat = !!templates;
        templates = templates ?? { copyFormat: palette.getCopyFormat(), displayTextFormat: palette.getDisplayTextFormat() };
        if (colorName === undefined) colorName = palette.selectedColorName;

        if (palette.writeFile && this.lib.isEditable(palette.child)) {
            return this.lib.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking, templates, colorName ?? undefined, false, { explicitFormat });
        }
        return this.lib.copyLink.copyLinkToSelection(checking, templates, colorName ?? undefined, false, { explicitFormat });
    }
}
