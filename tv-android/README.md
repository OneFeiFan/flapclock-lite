# 翻牌钟大屏 · 安卓外壳

全屏显示服务器上的大屏页（`/tv/`），电视上不做任何编辑，所有操作都在手机网页上完成。由原 PokerTimerTV 外壳改造而来。

## 两个版本

| 版本 | 应用 ID | 名称 | 加载的地址 | 用途 |
|---|---|---|---|---|
| `prod` 正式版 | `com.tablejoker.flapclock.tv` | 翻牌钟大屏 | 打包时用 `-PtvOrigin` 指定的 HTTPS 地址 | 正式部署 |
| `lan` 局域网测试版 | `com.tablejoker.flapclock.tv.lan` | 翻牌钟大屏（测试） | 首次启动时在电视上填写的电脑地址（http） | 用电脑当临时服务器测试 |

两个版本可以同时安装在同一台盒子上。

**共同点**：

- 全屏显示，屏幕常亮，开机自启。
- 断网时显示提示页，5 秒后自动重试。
- 只允许加载设定地址下的页面，原生接口也只对这些页面开放。
- 向大屏页提供安装号 `getInstallationId()`，作为屏幕编号。

**测试版特有**：

- 按遥控器菜单键可以重新填写服务器地址。很多遥控器没有菜单键，所以 2 秒内连按 3 次返回键也可以。
- 地址按“IP:端口”填写，比如 `192.168.1.5:18630`，会自动补全成 `http://…/tv/`；省略端口时默认 18630。

## 打包

需要 JDK 17 和安卓 SDK（平台 35、构建工具 35）。在 `local.properties` 里写上 `sdk.dir=SDK 路径`。

```bash
# 局域网测试版
./gradlew assembleLanRelease

# 正式版：必须指定地址，HTTPS 且以 /tv/ 结尾
./gradlew assembleProdRelease -PtvOrigin=https://你的域名/tv/

# 单元测试：兼容性护栏、地址白名单、地址规范化
./gradlew testProdDebugUnitTest testLanDebugUnitTest
```

产物在 `app/build/outputs/apk/<版本>/release/`。打 Release 包时会自动运行 Lint 检查，有错误就会中止构建。

## 签名密钥

Release 包的签名配置在 `keystore.properties` 里，格式见 `keystore.properties.example`。

这个文件和 `*.jks` 密钥文件都已加入 `.gitignore`，不会进入代码仓库，请单独妥善保管。**以后升级 APK 必须使用同一个密钥**，否则盒子上需要先卸载旧版才能安装新版，卸载后安装号会变，屏幕需要重新配对。

## 已知限制

- **开机自启**：安卓 10 及以上的部分系统，不允许应用在开机时从后台打开界面，这时需要手动打开一次。常见的电视盒子系统一般没有这个限制。
- **HTTPS 证书**：正式版只接受系统信任的证书。安卓 7.1 以下的系统不认 Let's Encrypt 的根证书，域名请使用根证书较老的 CA（例如 DigiCert）签发的证书。
