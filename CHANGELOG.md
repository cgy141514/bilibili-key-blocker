# 更新日志

本项目的所有重要改动都会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.1.0] - 2026-10-07

首次发布。

### 新增

- 支持 20 个 B 站播放页快捷键的逐项禁用，顺序与官方「快捷键说明」一致：
  `Q` `W` `E` `R` `G` `Space` `→` `←` `↑` `↓` `Esc` 媒体键 `play/pause` `F` `[` `]` `Enter` `D` `M` `Shift + 1` `Shift + 2`
- 页面内设置面板：可折叠、可拖动、记忆位置与折叠状态
- 「全部禁用 / 全部启用」批量开关
- 白天 / 黑夜 / 跟随系统三种主题；跟随系统时实时响应系统深浅色变化
- 在输入框、弹幕框、评论区打字时自动放行；`Enter` 例外，勾选后弹幕框内也无法发送
- 只拦截裸按键，`Alt + ←`、`Ctrl + 方向键`、`Ctrl + D` 等浏览器组合键不受影响

### 说明

- 首次发布，无破坏性变更

[未发布]: https://github.com/cgy141514/bilibili-key-blocker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cgy141514/bilibili-key-blocker/releases/tag/v0.1.0
