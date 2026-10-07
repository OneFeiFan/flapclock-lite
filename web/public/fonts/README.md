# 字体

| 文件 | 字体 | 说明 | 许可 |
|---|---|---|---|
| flapnum-700.woff2、flapnum-800.woff2 | Big Shoulders Display | 由可变字体固化出的 700、800 两个静态字重（老浏览器不支持可变字重） | SIL OFL 1.1，见 OFL-BigShoulders.txt |
| flaphei.woff2 | 思源黑体（Noto Sans CJK SC）Black | GB2312 全部字符（6763 个汉字）加 ASCII 与常用全角标点的子集 | SIL OFL 1.1，见 OFL-NotoSansCJK.txt |

两款字体都允许免费商用、子集化和随软件分发；按许可要求，字体文件不得单独出售。
如需支持 GB2312 以外的生僻字，可以用 fontTools 的 pyftsubset 重新生成 flaphei.woff2，生成方法见项目 README。
