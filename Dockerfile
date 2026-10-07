# 翻牌钟简化版 · 生产镜像
#
# 两段式构建：builder 里装前端依赖并产出 web/dist，runtime 只带服务端运行依赖、
# 服务端代码和前端产物，镜像里没有编译器、没有前端依赖、没有源码仓库的杂物。
#
# 有一条布局要求不能改：运行镜像里必须有 <root>/server 和 <root>/web/dist，
# 因为服务端是用 path.join(__dirname, '..', 'web', 'dist') 定位前端产物的，
# 没有任何环境变量可以覆盖它。

ARG NODE_IMAGE=node:22-alpine
# 国内机器走镜像源构建；要用官方源就 --build-arg NPM_REGISTRY=https://registry.npmjs.org
ARG NPM_REGISTRY=https://mirrors.tencentyun.com/npm

# ============ 构建阶段：前端 ============
FROM ${NODE_IMAGE} AS builder
ARG NPM_REGISTRY
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}
WORKDIR /build

# 先只拷 manifest 再装依赖：源码改动不会让依赖层失效，重复构建快很多
COPY web/package.json web/package-lock.json ./web/
# 用 ci 而不是 install：严格照 lockfile 装，构建结果可复现
RUN npm --prefix web ci --no-audit --no-fund

# shared/ 是前后端共用代码，前端构建要引用它（vite 的 fs.allow 放到了上一级）
COPY shared ./shared
COPY web ./web
RUN npm --prefix web run build
# 构建期断言：产物缺失就当场失败，不留到运行时
# （没有 web/dist 时服务端仍然能起来、/api/time 还是 200，但 / 只返回“前端尚未构建”文本，
#   电视打开是白屏，而且健康检查看不出问题）
RUN test -s web/dist/index.html

# ============ 运行阶段 ============
FROM ${NODE_IMAGE} AS runtime
ARG NPM_REGISTRY
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}
ENV NODE_ENV=production
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev --no-audit --no-fund

COPY server ./server
COPY shared ./shared
COPY --from=builder /build/web/dist ./web/dist
COPY deploy/healthcheck.mjs ./deploy/healthcheck.mjs

# 数据目录先建好并交给非 root 用户：store.js 启动时会 mkdirSync(DATA_DIR)，
# 挂上空卷或属主不对时它会直接抛错崩掉，且没有任何友好提示
RUN mkdir -p /data && chown -R node:node /data
USER node

# HOST 必须是 0.0.0.0：容器里监听 127.0.0.1 的话，反向代理连着都连不上
ENV PORT=18630 HOST=0.0.0.0 DATA_DIR=/data
EXPOSE 18630

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "deploy/healthcheck.mjs"]

# 用 exec 形式，node 是 PID 1，docker stop 的 SIGTERM 才能落到进程上，
# 服务端收到信号后会先把内存里的改动写盘（最多 400ms 去抖）再退出
CMD ["node", "server/index.js"]
