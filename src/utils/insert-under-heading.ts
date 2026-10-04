/**
 * Pure helpers for inserting an annotation block under a heading of a markdown note.
 * This module must not import anything from 'obsidian' so that it can be tested in isolation.
 */

export type AnnotationHeadingCreation = 'end' | 'start' | 'never';
export type AnnotationInsertPosition = 'bottom' | 'top' | 'page';

export interface InsertUnderHeadingOptions {
    /** The heading line, e.g. `## Annotations`. A missing `#` prefix is treated as `## `. */
    heading: string;
    /** What to do when the heading does not exist in the note. */
    createHeading: AnnotationHeadingCreation;
    /** Where to put the block inside the section. */
    position: AnnotationInsertPosition;
    /** Keep a blank line between adjacent blocks. Required for callouts not to be merged. */
    blankLineBetweenBlocks: boolean;
    /** Used when `position` is `'page'`: the page number of the new block. */
    page?: number;
    /** Used when `position` is `'page'`: returns the page number an existing block refers to, or null if unknown. */
    getPageOfBlock?: (block: string) => number | null;
}

export interface InsertUnderHeadingResult {
    data: string;
    /** Whether the heading had to be created. */
    createdHeading: boolean;
    /** 0-based line number of the first line of the inserted block in the new data. */
    line: number;
}

const HEADING_REGEX = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE_REGEX = /^[ \t]{0,3}(`{3,}|~{3,})/;

export function parseHeadingSetting(heading: string): { level: number, text: string } {
    heading = heading.trim();
    const match = heading.match(HEADING_REGEX);
    if (match) return { level: match[1].length, text: match[2].trim() };
    return { level: 2, text: heading.replace(/^#+/, '').trim() };
}

export function normalizeHeadingSetting(heading: string) {
    const { level, text } = parseHeadingSetting(heading);
    return '#'.repeat(level) + ' ' + text;
}

/** Returns the index of the first body line, i.e. the line right after the YAML frontmatter (0 if there is none). */
export function getBodyStartLine(lines: string[]) {
    if (lines[0]?.trimEnd() !== '---') return 0;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trimEnd();
        if (line === '---' || line === '...') return i + 1;
    }
    return 0;
}

/** Returns the heading level of each line (0 for non-heading lines), ignoring lines inside code blocks and the frontmatter. */
export function getHeadingLevels(lines: string[]) {
    const levels: { level: number, text: string }[] = lines.map(() => ({ level: 0, text: '' }));
    let fence: string | null = null;
    for (let i = getBodyStartLine(lines); i < lines.length; i++) {
        const line = lines[i];
        const fenceMatch = line.match(FENCE_REGEX);
        if (fenceMatch) {
            const marker = fenceMatch[1];
            if (fence === null) fence = marker;
            else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
            continue;
        }
        if (fence !== null) continue;
        const match = line.match(HEADING_REGEX);
        if (match) levels[i] = { level: match[1].length, text: match[2].trim() };
    }
    return levels;
}

export function findSection(lines: string[], heading: string): { headingLine: number, endLine: number } | null {
    const { level, text } = parseHeadingSetting(heading);
    const levels = getHeadingLevels(lines);
    const target = text.toLowerCase();

    const headingLine = levels.findIndex((h) => h.level === level && h.text.toLowerCase() === target);
    if (headingLine === -1) return null;

    let endLine = lines.length;
    for (let i = headingLine + 1; i < lines.length; i++) {
        if (levels[i].level && levels[i].level <= level) {
            endLine = i;
            break;
        }
    }
    return { headingLine, endLine };
}

const isBlank = (line: string | undefined) => line === undefined || line.trim() === '';

/**
 * Insert `block` at `index` in `lines` (mutating), adding blank lines around it where needed.
 * Returns the line number of the first line of the block.
 */
function insertLinesAt(lines: string[], index: number, block: string[], options: { blankBefore: boolean, blankAfter: boolean }) {
    const toInsert = [...block];
    let firstLine = index;
    if (options.blankBefore && index > 0 && !isBlank(lines[index - 1])) {
        toInsert.unshift('');
        firstLine++;
    }
    if (options.blankAfter && index < lines.length && !isBlank(lines[index])) {
        toInsert.push('');
    }
    lines.splice(index, 0, ...toInsert);
    return firstLine;
}

export function insertUnderHeading(data: string, block: string, options: InsertUnderHeadingOptions): InsertUnderHeadingResult | null {
    const blockLines = block.replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n');
    const lines = data.split('\n');
    const section = findSection(lines, options.heading);

    if (!section) {
        if (options.createHeading === 'never') return null;

        const headingLine = normalizeHeadingSetting(options.heading);

        if (options.createHeading === 'start') {
            const bodyStart = getBodyStartLine(lines);
            const toInsert = [headingLine, ...blockLines];
            if (!isBlank(lines[bodyStart]) && bodyStart < lines.length) toInsert.push('');
            lines.splice(bodyStart, 0, ...toInsert);
            return { data: lines.join('\n'), createdHeading: true, line: bodyStart + 1 };
        }

        // 'end': only append, never touch the existing content
        let prefix = data;
        if (prefix && !prefix.endsWith('\n')) prefix += '\n';
        if (prefix.trim() && !prefix.endsWith('\n\n')) prefix += '\n';
        const line = prefix.split('\n').length; // the heading goes on line `length - 1`, the block right after
        return { data: prefix + headingLine + '\n' + blockLines.join('\n') + '\n', createdHeading: true, line };
    }

    const { headingLine, endLine } = section;

    // The last non-blank line of the section
    let lastContentLine = endLine - 1;
    while (lastContentLine > headingLine && isBlank(lines[lastContentLine])) lastContentLine--;

    let index: number;

    if (options.position === 'top') {
        index = headingLine + 1;
        while (index <= lastContentLine && isBlank(lines[index])) index++;
        if (index > lastContentLine) index = headingLine + 1;
    } else {
        index = lastContentLine + 1;

        if (options.position === 'page' && typeof options.page === 'number' && options.getPageOfBlock) {
            // Split the section into blocks separated by blank lines and find the first block that comes after the new one
            let start = headingLine + 1;
            while (start <= lastContentLine) {
                while (start <= lastContentLine && isBlank(lines[start])) start++;
                if (start > lastContentLine) break;
                let end = start;
                while (end + 1 <= lastContentLine && !isBlank(lines[end + 1])) end++;
                const page = options.getPageOfBlock(lines.slice(start, end + 1).join('\n'));
                if (page !== null && page > options.page) {
                    index = start;
                    break;
                }
                start = end + 1;
            }
        }
    }

    const afterHeading = index === headingLine + 1;
    const line = insertLinesAt(lines, index, blockLines, {
        blankBefore: options.blankLineBetweenBlocks && !afterHeading,
        // Always keep the next heading separated from the block; keep blocks separated if requested
        blankAfter: index >= endLine || options.blankLineBetweenBlocks,
    });

    return { data: lines.join('\n'), createdHeading: false, line };
}

/**
 * Given the old text and the new text produced by a pure insertion, returns the inserted text and its offset in the old text.
 * Returns null if `newData` is not `oldData` with a single contiguous insertion.
 */
export function diffInsertion(oldData: string, newData: string): { offset: number, text: string } | null {
    const insertedLength = newData.length - oldData.length;
    if (insertedLength < 0) return null;
    let offset = 0;
    const max = oldData.length;
    while (offset < max && oldData[offset] === newData[offset]) offset++;
    if (oldData.slice(offset) !== newData.slice(offset + insertedLength)) return null;
    return { offset, text: newData.slice(offset, offset + insertedLength) };
}
