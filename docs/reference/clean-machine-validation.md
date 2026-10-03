# Clean-machine validation

Use an Apple silicon Mac running macOS 14 or later. Copy the signed DMG and its assembly, acceptance and source-manifest receipts together.

## Install

1. Calculate the DMG SHA-256 with `shasum -a 256 Leafloom-preview-arm64.dmg` and compare it with `sha256` in the assembly receipt.
2. Mount the image and copy Leafloom into Applications.
3. Verify the installed application with `codesign --verify --deep --strict /Applications/Leafloom.app`.
4. Inspect its signer with `codesign -dv --verbose=4 /Applications/Leafloom.app`. The identifier is `org.mafifi.leafloom`; the team is `QJJ98A74J8`.
5. Follow the package release notes for its Gatekeeper and notarization status, then open the app through Finder.

## Author journey

- Complete onboarding and create a book. Edit title, subtitle and author; close and reopen it.
- Type paragraphs, a scene and another chapter. Use Undo and Redo immediately and after switching to Notes.
- Format a passage in bold and italic. Add poetry, an Outline entry and a margin note.
- Compose text with a macOS Chinese or Japanese input method, then enter an accented character with a dead key. Check committed text, selection, Undo and Redo before saving and reopening.
- Move a passage into Darlings and restore it. Confirm the wording and formatting.
- Enable spelling, select a language and add a word to the author dictionary.
- Choose, replace and remove a custom cover. Close and reopen the book after each change.
- Import the supplied Markdown example and another document. Export the book to TXT, Markdown, HTML, DOCX, EPUB and PDF.
- Inspect PDF Contents links and page numbers. Open EPUB and DOCX in independent readers.
- Save, quit and reopen. Confirm manuscript, notes, outline, Darlings, custom cover and reading position.
- Create another author and shelf. Move and bind books; edit a publication page and export the bound book.

## Platform journey

Open actual file pickers, reveal a book folder, enter and leave fullscreen, use the native Edit menu, and cancel a print dialog. Use an isolated test email address to inspect an email draft and attachment. Record each permission prompt and whether it repeats after restart.

Quit during active writing in a disposable book, reopen and inspect recovery. Retain the book folder before investigating unexpected results. Record the macOS version, app version, timestamp, operation and expected outcome with any crash report.

Leafloom stores its library in `~/Documents/Leafloom`. Test against disposable books and keep original NEO books separate.
