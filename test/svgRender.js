class SVGRenderer {
    constructor(containerId, inputId, renderButtonId, formatButtonId) {
        this.container = document.getElementById(containerId);
        this.input = document.getElementById(inputId);
        this.renderButton = document.getElementById(renderButtonId);
        this.formatButton = document.getElementById(formatButtonId);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.renderButton.addEventListener('click', () => this.renderInputSVG());
        this.formatButton.addEventListener('click', () => this.formatXML());
    }

    render(svgString) {
        this.container.innerHTML = svgString;
    }

    renderInputSVG() {
        const svgContent = this.input.value.trim();
        if (svgContent) {
            this.render(svgContent);
        } else {
            alert('请输入有效的 SVG 代码');
        }
    }

    formatXML() {
        const xml = this.input.value.trim();
        const formatted = this.prettifyXml(xml);
        this.input.value = formatted;
    }

    prettifyXml(sourceXml) {
        const xmlDoc = new DOMParser().parseFromString(sourceXml, 'application/xml');
        const xsltDoc = new DOMParser().parseFromString([
            '<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
            '  <xsl:strip-space elements="*"/>',
            '  <xsl:template match="para[content-style][not(text())]">',
            '    <xsl:value-of select="normalize-space(.)"/>',
            '  </xsl:template>',
            '  <xsl:template match="node()|@*">',
            '    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
            '  </xsl:template>',
            '  <xsl:output indent="yes"/>',
            '</xsl:stylesheet>',
        ].join('\n'), 'application/xml');

        const xsltProcessor = new XSLTProcessor();    
        xsltProcessor.importStylesheet(xsltDoc);
        const resultDoc = xsltProcessor.transformToDocument(xmlDoc);
        return new XMLSerializer().serializeToString(resultDoc);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const renderer = new SVGRenderer('svgContainer', 'svgInput', 'renderButton', 'formatButton');

    // 设置默认的 SVG 内容
    const defaultSVGContent = `
        <svg version="1.1" SVG_ID="1340" style="position: absolute;overflow: visible;z-index: 1340;left: 128.52163428571427px;top: 165.0240495238095px;width: 30.706948571428565px;height: 31.588236190476188px;">
            <path d="M-709.6727466666666 10726.770003809524 C-682.3728419047618 10699.189154285712 -682.3728419047618 10654.468712380953 -709.6727466666666 10626.887078095237 C-736.972259047619 10599.304659047619 -781.2340076190476 10599.304659047619 -808.53352 10626.887078095237 C-835.8334247619048 10654.468712380953 -835.8334247619048 10699.189154285712 -808.53352 10726.770003809524 C-781.2340076190476 10754.353207619048 -736.972259047619 10754.353207619048 -709.6727466666666 10726.770003809524 " 
                  transform="matrix(0.1235 0 0 -0.1235 109.42445333333332 1334.0862133333333)" 
                  clip-path="url(#CLIP_PATH_1340)" 
                  style="fill: none;stroke-width: 7.847619047619046px;stroke: rgb(44, 44, 44);">
            </path>
            <defs>
                <clipPath id="CLIP_PATH_1340">
                    <path transform="matrix(0.3528 0 0 0.3528 0 0)" 
                          fill="black" 
                          d="M0 543.8399999999999 L0 0 L624.8666666666666 0 L624.8666666666666 543.8399999999999 Z" 
                          style="left: 4.233005714285714px;top: -185.26227428571428px; width: 624.8666666666666px;height: 543.8399999999999px;">
                    </path>
                </clipPath>
            </defs>
        </svg>
    `;

    renderer.input.value = defaultSVGContent;
});
