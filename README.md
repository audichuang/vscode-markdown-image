# MarkInk

A powerful Markdown productivity toolkit for VS Code.

**Support Mac/Windows/Linux!**

![paste-image](res/vscode-paste-image.gif)

## Features

- **Paste Image** - Paste images directly from clipboard to Markdown/AsciiDoc
- **Word to Markdown** - Convert .docx files to Markdown with image extraction
- **Export** - Export Markdown to HTML or Word (.docx)
- **Document Outline** - Navigate document structure with tree view
- **Image Checker** - Validate image links in your documents
- **Table Tools** - Format and insert Markdown tables
- **Rename Image** - Rename images and auto-update references

## Installation

Search for `MarkInk` in the VS Code Extensions Marketplace, or install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=audichuang.markink).

## Usage

### Paste Image

1. Copy an image to clipboard (screenshot or from other apps)
2. Open command palette: `Ctrl+Shift+P` (`Cmd+Shift+P` on Mac)
3. Type: "Paste Image" or use shortcut: `Ctrl+Alt+V` (`Cmd+Alt+V` on Mac)
4. Image will be saved and the Markdown link inserted

![confirm-inputbox](res/confirm-inputbox.png)

### Word to Markdown

1. Right-click on a `.docx` file in the Explorer
2. Select "Convert Word to Markdown"
3. Images are automatically extracted and saved

### Export Markdown

1. Right-click on a `.md` file in the Explorer
2. Select "Export Markdown"
3. Choose output format (HTML or Word)

## Configuration

### Image Path Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `pasteImage.path` | Destination folder for images | `${currentFileDir}` |
| `pasteImage.basePath` | Base path for image URLs | `${currentFileDir}` |
| `pasteImage.defaultName` | Default image filename pattern | `Y-MM-DD-HH-mm-ss` |
| `pasteImage.namePrefix` | Prefix for image filename | `""` |
| `pasteImage.nameSuffix` | Suffix for image filename | `""` |

### Path Variables

You can use these variables in path settings:

- `${currentFileDir}` - Directory of current file
- `${projectRoot}` - Workspace root folder
- `${currentFileName}` - Current filename with extension
- `${currentFileNameWithoutExt}` - Current filename without extension

### Insert Pattern Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `pasteImage.insertPattern` | Pattern for inserted text | `${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}` |
| `pasteImage.prefix` | Prepend to image path | `""` |
| `pasteImage.suffix` | Append to image path | `""` |

Insert pattern variables:

- `${imageFilePath}` - Full image path (encoded)
- `${imageFileName}` - Image filename with extension
- `${imageFileNameWithoutExt}` - Image filename without extension
- `${imageSyntaxPrefix}` - `![](` for Markdown, `image::` for AsciiDoc
- `${imageSyntaxSuffix}` - `)` for Markdown, `[]` for AsciiDoc

### Other Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `pasteImage.showFilePathConfirmInputBox` | Show input box to confirm/edit path | `false` |
| `pasteImage.filePathConfirmInputBoxMode` | `fullPath` or `onlyName` | `fullPath` |
| `pasteImage.encodePath` | URL encoding: `none`, `urlEncode`, `urlEncodeSpace` | `urlEncodeSpace` |
| `pasteImage.forceUnixStyleSeparator` | Use `/` separator on all platforms | `true` |

## Configuration Examples

### Hexo Blog

```json
{
  "pasteImage.path": "${projectRoot}/source/img",
  "pasteImage.basePath": "${projectRoot}/source",
  "pasteImage.prefix": "/"
}
```

### Images in Subfolder per Article

```json
{
  "pasteImage.path": "${currentFileDir}/images",
  "pasteImage.basePath": "${currentFileDir}"
}
```

### Image Filename with Article Prefix

```json
{
  "pasteImage.namePrefix": "${currentFileNameWithoutExt}_"
}
```

## Commands

| Command | Description |
|---------|-------------|
| `Paste Image` | Paste image from clipboard |
| `Convert Word to Markdown` | Convert .docx to .md |
| `Export Markdown` | Export to HTML/Word |
| `Check Image Links` | Validate image references |
| `Rename Image` | Rename image and update links |
| `Format Table` | Format Markdown table |
| `Insert Table` | Insert new table |

## Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Alt+V` / `Cmd+Alt+V` | Paste Image |

## License

[MIT License](LICENSE.txt)

## Contributing

Issues and pull requests are welcome at [GitHub](https://github.com/audichuang/vscode-markdown-image).
