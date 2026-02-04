import * as path from 'path';
import upath from 'upath';

const PATH_VARIABLE_PATTERNS = {
    currentFileDir: /\$\{currentFileDir\}/g,
    projectRoot: /\$\{projectRoot\}/g,
    currentFileName: /\$\{currentFileName\}/g,
    currentFileNameWithoutExt: /\$\{currentFileNameWithoutExt\}/g,
    imageFilePath: /\$\{imageFilePath\}/g,
    imageOriginalFilePath: /\$\{imageOriginalFilePath\}/g,
    imageFileName: /\$\{imageFileName\}/g,
    imageFileNameWithoutExt: /\$\{imageFileNameWithoutExt\}/g,
    imageSyntaxPrefix: /\$\{imageSyntaxPrefix\}/g,
    imageSyntaxSuffix: /\$\{imageSyntaxSuffix\}/g,
};

export function replacePathVariables(
    pathStr: string,
    projectRoot: string | undefined,
    curFilePath: string,
    postFunction: (value: string) => string = (x) => x
): string {
    const currentFileDir = path.dirname(curFilePath);
    const ext = path.extname(curFilePath);
    const fileName = path.basename(curFilePath);
    const fileNameWithoutExt = path.basename(curFilePath, ext);

    let result = pathStr;
    result = result.replace(PATH_VARIABLE_PATTERNS.projectRoot, postFunction(projectRoot || ''));
    result = result.replace(PATH_VARIABLE_PATTERNS.currentFileDir, postFunction(currentFileDir));
    result = result.replace(PATH_VARIABLE_PATTERNS.currentFileName, postFunction(fileName));
    result = result.replace(PATH_VARIABLE_PATTERNS.currentFileNameWithoutExt, postFunction(fileNameWithoutExt));

    return result;
}

export interface RenderOptions {
    languageId: string;
    basePath: string;
    imageFilePath: string;
    forceUnixStyleSeparator: boolean;
    prefix: string;
    suffix: string;
    encodePath: 'none' | 'urlEncode' | 'urlEncodeSpace';
    insertPattern: string;
}

export function renderFilePath(options: RenderOptions): string {
    let { imageFilePath } = options;
    const { languageId, basePath, forceUnixStyleSeparator, prefix, suffix, encodePath, insertPattern } = options;

    if (basePath) {
        imageFilePath = path.relative(basePath, imageFilePath);
    }

    if (forceUnixStyleSeparator) {
        imageFilePath = upath.normalize(imageFilePath);
    }

    const originalImagePath = imageFilePath;
    const ext = path.extname(originalImagePath);
    const fileName = path.basename(originalImagePath);
    const fileNameWithoutExt = path.basename(originalImagePath, ext);

    imageFilePath = `${prefix}${imageFilePath}${suffix}`;

    if (encodePath === 'urlEncode') {
        imageFilePath = encodeURI(imageFilePath);
    } else if (encodePath === 'urlEncodeSpace') {
        imageFilePath = imageFilePath.replace(/ /g, '%20');
    }

    let imageSyntaxPrefix = '';
    let imageSyntaxSuffix = '';
    switch (languageId) {
        case 'markdown':
            imageSyntaxPrefix = '![](';
            imageSyntaxSuffix = ')';
            break;
        case 'asciidoc':
            imageSyntaxPrefix = 'image::';
            imageSyntaxSuffix = '[]';
            break;
    }

    let result = insertPattern;
    result = result.replace(PATH_VARIABLE_PATTERNS.imageSyntaxPrefix, imageSyntaxPrefix);
    result = result.replace(PATH_VARIABLE_PATTERNS.imageSyntaxSuffix, imageSyntaxSuffix);
    result = result.replace(PATH_VARIABLE_PATTERNS.imageFilePath, imageFilePath);
    result = result.replace(PATH_VARIABLE_PATTERNS.imageOriginalFilePath, originalImagePath);
    result = result.replace(PATH_VARIABLE_PATTERNS.imageFileName, fileName);
    result = result.replace(PATH_VARIABLE_PATTERNS.imageFileNameWithoutExt, fileNameWithoutExt);

    return result;
}
