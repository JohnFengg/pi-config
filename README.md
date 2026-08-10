# pi-config

我的个人 pi 定制仓库：扩展、主题、agent 配置，用 git 管理，可随时回滚。

## 结构

```
extensions/    个人扩展(pi 包资源,自动加载)
themes/        gruvbox-dark 主题(pi 包资源)
config/        非包资源,通过 install.sh 符号链接到 ~/.pi/agent/
               (settings.json / keybindings.json / mcp.json / models.json /
                statusline 配置 / APPEND_SYSTEM.md / pi-permission-system 权限配置)
tests/         扩展的验证脚本(node 直接跑)
install.sh     装机/恢复脚本
```

## 新用户安装（从零开始）

```bash
# 1. 装官方 pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 2. 拉本仓库(目前是 private,需要先有访问权限)
gh repo clone JohnFengg/pi-config ~/AI/pi-config   # 位置随意

# 3. 一键安装:符号链接所有配置 + 注册本地 pi 包
cd ~/AI/pi-config && ./install.sh

# 4. 首次启动 pi 会自动安装 settings.json 里列的全部 npm 包;
#    然后 /login 配置你的模型凭证(凭证不随仓库分发)
pi
```

只想要扩展和主题、不要机器配置的话,也可以像普通 pi 包一样直接装:

```bash
pi install git:github.com/JohnFengg/pi-config
```

注意:git 方式安装的副本由 pi 包管理器托管,`pi update` 时会 `git clean` + 重置到远端 ref,**不要在托管副本里改东西**;日常改动走下面的本地工作流。

## 日常工作流

本机上 `~/.pi/agent` 里的配置文件是指向本仓库的**符号链接**,扩展通过 `pi install <本地路径>` 直接**从工作目录加载**(不复制),所以:

```bash
# 改任何东西(扩展/主题/配置)——改动对 pi 立即可见(/reload 或新 session)
# 然后纳入版本管理:
git add -A && git commit -m "..." && git push
```

pi 对 settings.json 等文件的写入是普通 `writeFileSync`(非原子替换),会透过符号链接写进仓库工作区,之后 `git add` 即可捕获(比如 `pi install` 新增的包记录)。

## 回滚

```bash
git log --oneline                 # 找到目标版本
git checkout <commit> -- .        # 或 git revert <commit>
# 然后在 pi 里 /reload
```

## 不入库的东西

`auth.json`(凭证)、`sessions/`、`*.log`、`trust.json`(本机项目信任列表)、npm 包本体(`settings.json` 的 `packages` 列表会在首次启动时自动安装恢复)。扩展的运行时数据(如 `extensions/pi-permission-system/logs/`)同样不入库。
