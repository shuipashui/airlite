# 光渡 AirLite

参考 [AirFerry](https://github.com/UR-SillyB/AirFerry)：电脑屏幕播二维码，手机网页扫码收文件。不需要自建服务器。

当前版本按手机网页可上线使用打磨：默认「高速」可解、发送进度不挡码、接收端 Worker 解码、屏幕常亮、iOS 可用分享保存。单文件建议 2MB 以内；超过 12MB 会拒绝发送。

## 马上用

| 端 | 打开方式 |
| --- | --- |
| **手机接收端（推荐）** | 用 Safari / Chrome 打开 https://shuipashui.github.io/airlite/receiver.html |
| **入口页** | https://shuipashui.github.io/airlite/ |
| **电脑发送端** | 双击本仓库里的 `sender.html`（不要只下载这一个文件） |

不要用微信 / QQ 内置浏览器打开接收端，那里通常开不了摄像头。点右上角 `…` → **在浏览器中打开**。

## 推荐流程

1. 电脑双击 `sender.html`
2. 手机扫发送页右侧那个**静态二维码**（打开 GitHub 上的接收端）
3. 手机点「授权并打开摄像头」，允许相机
4. 电脑选文件，点「开始发送」
5. 手机对准屏幕上的**动态二维码**，收完后保存

电脑发送走的是屏幕光线，不经过 GitHub。GitHub 网页只用来给手机一个 HTTPS 页面，这样才能开摄像头。

## 速度预设

| 预设 | 布局 | 码版本 | 帧率 | 适用 |
| --- | --- | --- | --- | --- |
| 稳定 | 1 个大码 | V11 | 12 | 铺满屏幕，远一点也稳 |
| 高速（默认） | 左右 2 个大码 | V12 | 16 | 手机网页推荐 |
| 激进 | 左右 2 个大码 | V14 | 16 | 近、手稳 |
| 极限 | 左右 2 个大码 | V16 | 15 | 贴屏、亮屏 |

发送时会收起顶栏，二维码尽量铺满右侧画面。4 个小码在手机上很难解，已不再作为默认。

## 协议

每帧二进制二维码：

```
AF1 | type | session(u32) | extra(u32) | crc32(payload) | payload
```

- type 0：描述符（文件名、大小、CRC、块大小、块数、gzip 标记）
- type 1：源符号
- type 2：修复符号（喷泉码，丢帧可补）

## 文件

```
sender.html      电脑发送端（可直接双击）
receiver.html    手机接收端（请走 GitHub 网页）
index.html       入口
config.js        GitHub 接收页地址
protocol.js      编解码 / 喷泉码
vendor/          qrcode-generator、jsQR、fflate
```

## 与 AirFerry 的差异

原项目有浏览器插件、Android / Windows 原生接收端和 RaptorQ。这里只留电脑网页发送 + 手机网页接收。
