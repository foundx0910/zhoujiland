/**
 * ⭐️ 站点配置文件 —— 想改名字、文案、配色，改这一个文件就够了 ⭐️
 *
 * 改完怎么生效：
 *   npm run build          只重新打包（本地预览用）
 *   ./cf.sh deploy         打包 + 发布到线上（一条命令搞定）
 *
 * 注意：
 *   1. 只改「引号里的内容」最安全；引号别删、逗号别丢。
 *   2. 颜色要写 #开头的十六进制，比如 '#c2410c'。
 *   3. 深浅色分开配：colors.light 是浅色模式，colors.dark 是深色模式。
 *   4. 改完如果页面上没变化，先强制刷新（⌘ + Shift + R）。
 *   5. 这里改了 name，浏览器标签页标题、分享卡片描述都会跟着变（构建时自动注入）。
 */

export const site = {
  /* ------------------------------ 站点名称 ------------------------------ */
  name: 'zhoujiland',

  /** 站内链接是否都用「新标签页」打开（true = 点了新开一个页面；false = 原地跳转） */
  linksOpenInNewTab: true,
  tagline: 'zhoujiland的6b啊，随便聊聊',
  footerNote: '帖子存在 Cloudflare D1，图片存在 KV',

  /* -------------------------------- 配色 --------------------------------
   * 想换个风格，改这几个颜色就行（比如把主色改成绿色 #16a34a）。
   */
  colors: {
    light: {
      accent: '#c2410c', // 主色：按钮、链接、高亮
      accentSoft: '#fdede2', // 主色的浅底（选中态、未读背景）
      bg: '#f6f3ee', // 页面背景
      card: '#fffdf9', // 卡片/输入框背景
      soft: '#f1ece3', // 次级背景（楼层左侧、工具栏）
      border: '#e7e0d5', // 边框
      borderStrong: '#d9d0c1', // 边框（重一点，输入框用）
      text: '#23201d', // 正文
      muted: '#7d746a', // 次要文字
    },
    dark: {
      accent: '#fb923c',
      accentSoft: '#33231a',
      bg: '#1a1714',
      card: '#221e19',
      soft: '#2a251f',
      border: '#352f28',
      borderStrong: '#453d34',
      text: '#ece7e0',
      muted: '#a8a096',
    },
  },

  /* ---------------------------- 开始界面 ----------------------------
   * 一进站先看到这个界面：图标 + 昵称 + 进入按钮。
   * 换成自己的图标：把图片放进 web/public/（比如 my-icon.png），
   * 然后把下面的 icon 改成 '/my-icon.png' 即可。
   */
  welcome: {
    /* 开始界面什么时候出现：
       'once'    = 只显示一次（默认）
       'session' = 每个浏览器会话显示一次
       'always'  = 每次打开/刷新都显示 */
    show: 'once',
    icon: '/entry-icon.svg',
    title: 'zhoujiland',
    subtitle: 'zhoujiland讨论室',
    nicknameLabel: '先起个昵称吧',
    nicknamePlaceholder: '2-20 个字，中英文都行',
    button: '进入',
    hint: '昵称只存在你自己的浏览器里，不用注册也能发帖。',
    hasAccount: '已经有账号？',
    login: '去登录',
    back: '先去逛逛',
  },

  /* ---------------------------- 顶栏与导航 ---------------------------- */
  nav: {
    home: '逛逛',
    me: '我的',
    admin: '管理',
    searchPlaceholder: '搜点什么…',
    login: '登录',
    register: '注册',
    logout: '退出',
  },

  /* ------------------------------ 公告 ------------------------------ */
  /** 站内确认框的文案（删除、封禁等操作都会用到） */
  confirm: {
    title: '确认操作',
    ok: '确定',
    cancel: '取消',
  },

  announce: {
    /* 公告怎么显示：'modal' = 进站弹窗（默认）、'banner' = 顶部横幅、'both' = 两个都要 */
    style: 'modal',
    modalTitle: '公告',
    close: 'xiodeibano',
    navLabel: '公告',
    all: '查看全部公告 →',
    expand: '展开',
    collapse: '收起',
    dismiss: '不再显示这条',
    more: '查看详情',
    levelNormal: '普通',
    levelImportant: '重要',
    past: '已结束',
    none: '暂时没有公告。',
    /* 后台管理面板 */
    sectionTitle: '公告',
    newOne: '＋ 发公告',
    cancelNew: '先算了',
    editTitle: '编辑公告',
    newTitle: '发一条公告',
    titleLabel: '标题',
    titlePlaceholder: '例如：本周六凌晨维护，可能短暂打不开',
    contentLabel: '正文（支持 Markdown）',
    contentPlaceholder: '想让大家都知道的事，写在这里…',
    levelLabel: '级别',
    linkLabel: '附带链接（可选）',
    linkPlaceholder: 'https://… 或 /t/12',
    linkTextLabel: '链接文字（可选）',
    sortLabel: '排序权重（越大越靠前）',
    activeLabel: '立即发布（取消勾选 = 先存着不显示）',
    save: '保存',
    publish: '上架',
    unpublish: '下架',
    remove: '删除',
    empty: '还没有公告。想让大家都知道的事，写在这里。',
    statusOn: '生效中',
    statusOff: '已下架',
  },

  /* ------------------------------ 各处文案 ------------------------------ */
  text: {
    /* 游客提示条 */
    guestHint: '现在是游客身份，随便逛逛没问题；想说话的话，起个昵称就行。',
    setNickname: '设置昵称',

    /* 首页 / 板块列表 */
    homeTitle: '逛逛板块',
    homeSubtitle: '想聊点什么？挑个板块进去坐坐，或者自己开一块地。',
    newBoard: '＋ 开个新板块',
    newBoardCancel: '先算了',
    newBoardTitle: '开个新板块',
    newBoardNameLabel: '板块名称',
    newBoardNamePlaceholder: '例如：摄影交流',
    newBoardDescLabel: '板块简介（可选）',
    newBoardDescPlaceholder: '一句话说清这儿聊什么',
    newBoardSubmit: '开张！',
    noBoards: '还没有板块，要不你开第一个？',

    /* 板块页 */
    newThread: '＋ 说点什么',
    newThreadCancel: '先算了',
    newThreadTitle: '发个新帖',
    newThreadTitleLabel: '标题',
    newThreadTitlePlaceholder: '想聊点什么？',
    newThreadBodyLabel: '正文（这就是 1 楼）',
    newThreadSubmit: '发出去',
    boardEmpty: '这儿还静悄悄的……要不要你先开个头？',
    boardNotice: '想说话？先在上头起个昵称，或者注册/登录一下。',
    sortActive: '最近回复',
    sortNew: '最新发布',
    sortHot: '最多回复',
    boardSearchPlaceholder: '板块内搜索…',

    newBoardNeedIdentity: '先在上头起个昵称、或者登录一下，就能开板块了。',

    /* 帖子页（楼层） */
    replyTitle: '说点什么（占一层楼）',
    replyToFloor: '回复本层',
    replySubmit: '发出去',
    replySubSubmit: '回这一层',
    replyCancel: '取消回复本层',
    orderAsc: '↓ 倒着看',
    orderDesc: '↑ 正着看',
    lockedHint: '该帖已被锁定，暂时没法回复。',
    needIdentity: '先起个昵称（或登录）就能说话了',
    editorPlaceholder:
      '随便写，支持 Markdown：**加粗**、`代码`、> 引用、- 列表，图片直接拖进来或者粘贴…',
    editorHint: 'Markdown 随便写；图片能拖能粘；⌘/Ctrl + Enter 直接发',

    /* 搜索页 */
    searchTitle: '找找',
    searchEmpty: '翻了一遍，没找着相关的。',
    searching: '翻箱倒柜中…',

    /* 登录 / 注册 */
    loginTitle: '登录',
    loginSubtitle: '登录之后，发言就带着你的名字了。',
    loginSubmit: '进去',
    registerTitle: '注册',
    registerSubtitle: '注册一个，走到哪都认得你；懒得注册的话，匿名也能说话。',
    registerSubmit: '注册并进去',
    guestSectionTitle: '懒得注册？那就匿名说话',
    guestSectionHint: '起个昵称就能发帖盖楼，昵称只存在你自己浏览器里。',
    guestUseName: '用这个昵称',

    /* 个人中心 */
    meTitle: '个人中心',
    myGuestTitle: '我的',
    signatureLabel: '个性签名',
    signatureHint: '会显示在你的个人主页，以及你发的每一层楼下面（最多 100 字）。',
    signaturePlaceholder: '例如：折腾使人快乐 / 白天写 bug，晚上修 bug',
    signatureSave: '保存签名',
    avatarChange: '换头像',
    avatarRemove: '移除',
    passwordTitle: '修改密码',
    passwordOld: '原密码',
    passwordNew: '新密码（至少 6 位）',
    passwordSave: '保存',
    myContentTitle: '我的内容',

    /* 消息通知 */
    notifTitle: '消息通知',
    notifEmpty: '还没有收到过消息。多发几帖、多回几层，热闹起来就有啦。',
    notifAllRead: '全部标为已读',
    notifReadDone: '都标成已读啦',

    /* 举报 */
    reportButton: '🚩 举报',
    reportThreadButton: '🚩 举报本帖',
    reportTitlePost: '举报这一层楼',
    reportTitleThread: '举报这一篇帖子',
    reportHint: '举报会直接送到管理员和本板块版主那里，他们看到就会处理。恶意举报会被记录。',
    reportDetailPlaceholder: '想补充点什么？（可选，最多 300 字）',
    reportCancel: '算了',
    reportSubmit: '提交举报',
    reportDone: '收到，谢谢你帮忙盯着 🙏',
    reportReasons: ['广告 / 推广', '人身攻击', '违法违规', '色情低俗', '垃圾刷屏', '其他'],

    /* 个人主页 / 个人中心零碎文字 */
    guestIdentityTitle: '当前身份：匿名访客',
    myThreadsTitle: '我发过的帖子',
    myPostsTitle: '我盖过的楼',
    profileFallbackBio: '这个人很神秘，还没有写个性签名。',
    profileEdit: '编辑我的资料',
    viewPublicProfile: '查看我的公开主页 →',
    statThreads: '主题帖',
    statReplies: '回复',
    statLikes: '获赞',
    notFoundUserTitle: '找不到这个人',
    joinedAt: '注册于',
    lastActive: '最后活跃',
    logoutDone: '已退出登录',

    /* 其他零碎提示 */
    loading: '马上就来…',
    loadingFallback: '正在开门迎客…',
    serverBusy: '服务端打了个盹，稍后再试试',
    publishOk: '发出去啦',
  },
};

export default site;
