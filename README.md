# 光渡 AirLite

参考 [AirFerry](https://github.com/UR-SillyB/AirFerry) 的核心思路，做成**只保留电脑发送 + 手机网页接收**的离线光学快传。

- 电脑：双击 `sender.html`，无需安装、无需服务器
- 手机：用浏览器打开 `receiver.html`，摄像头对准屏幕
- 不走局域网 / 蓝牙 / USB / 云盘
- 喷泉码（简化 LT）单向发送，丢帧、乱序、重复都能继续收

AirFerry 原项目还有浏览器插件、Android / Windows 原生接收端、RaptorQ RFC 6330、4 码 1400B@60fps 等完整能力。本目录是按「电脑发送、手机网页收、尽量快」裁过的单机版。

## 怎么用

1. 电脑用 Chrome / Edge 打开 `sender.html`
2. 拖入文件（多个会打成 zip），或粘贴文字
3. 选速度预设后点「开始发送」，建议全屏（`F`）
4. 手机打开 `receiver.html`，授权摄像头，对准屏幕
5. 进度满后点「保存文件」

### 速度预设

| 预设 | 布局 | 码版本 | 帧率 | 适用 |
| --- | --- | --- | --- | --- |
| 稳定 | 1 码 | V12 | 12 | 远、抖、屏幕糊 |
| 高速 | 4 码 | V12 | 18 | 手机网页较稳 |
| 激进（默认） | 4 码 | V16 | 24 | 近距离 |
| 极限 | 4 码 | V20 | 30 | 贴屏、亮屏、手稳 |

网页摄像头 + JS 解码比 AirFerry 的原生 ZXing 慢，默认没有上到 1400B@60fps。近、亮、稳时用「极限」。

## 手机摄像头权限

浏览器规定：摄像头只能在 **HTTPS 或 localhost** 下打开。

- 电脑本机预览接收端：可用任意本地静态服务打开 `receiver.html`
- 真机：把整个 `airferry-lite` 文件夹拷到手机后，用能提供安全上下文的方式打开；或把 `receiver.html` + `protocol.js` + `vendor/` 丢到任意静态 HTTPS（GitHub Pages 等）

发送端是纯本地画面，**传文件本身不需要网、不需要服务器**。

## 协议（精简）

每帧二进制二维码：

```
AF1 | type | session(u32) | extra(u32) | crc32(payload) | payload
```

- type 0：描述符（文件名、大小、CRC、块大小、块数、gzip 标记）
- type 1：源符号（extra = ESI）
- type 2：修复符号（extra = seed，按同一 xorshift 展开 XOR 组合）

源符号发完一遍后持续产生不重复修复符号。接收端用剥离译码（peeling）恢复缺失块。

文本 / 单文件会尝试 gzip；多文件打 zip。

## 文件

```
sender.html      电脑发送端（双击即可）
receiver.html    手机网页接收端
protocol.js      编解码 / 喷泉码
vendor/          qrcode-generator、jsQR、fflate
```

## 与 AirFerry 的差异

| | AirFerry | 本目录 |
| --- | --- | --- |
| 发送 | 扩展 + 网页 + 单文件 | 仅本地网页发送端 |
| 接收 | Android / Windows 原生 + 网页 | 仅手机网页 |
| 编码 | Rust RaptorQ + WASM | JS 简化喷泉码 |
| 峰值 | 原生端约 200–300 KB/s | 受手机浏览器解码限制，近距离 4 码更高吞吐 |

需要满血原生速度、大文件断点、跨端一致协议时，请直接用原项目。
