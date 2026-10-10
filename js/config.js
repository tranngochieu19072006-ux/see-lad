/**
 * SEE LAD - Mock Data & Default Config
 */

window.SEE_LAD_CONFIG = {
  appName: "SEE LAD",
  version: "2.4.0 Pro",
  creator: "SEE LAD Team",
  
  // Default Initial User
  currentUser: {
    id: "user_guest",
    name: "Người dùng SEE LAD",
    username: "@seelad_user",
    avatar: "/uploads/avatar_hieu.jpg",
    bio: "Chào mừng bạn đến với mạng xã hội SEE LAD!",
    status: "online", // 'online' | 'busy' | 'offline'
    phone: "+84 900 888 999",
    email: "user@seelad.app",
    location: {
      lat: 10.7769,
      lng: 106.7009,
      name: "TP. Hồ Chí Minh"
    },
    qrStyle: {
      fgColor: "#6366f1",
      bgColor: "#ffffff",
      dotStyle: "rounded",
      hasLogo: true
    }
  },

  // Friends & Contacts List (No mock bots, real friends only)
  contacts: [
    {
      id: "user_1791396467957",
      name: "Đức Kiệt",
      username: "@duckiet8146",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
      status: "online",
      statusText: "Đang hoạt động (Online)",
      unread: 0,
      streak_count: 14,
      location: {
        lat: 10.7769,
        lng: 106.7009,
        distance: "1.2 km",
        name: "TP. Hồ Chí Minh"
      },
      chatTheme: "theme-cyber-indigo"
    }
  ],

  // Initial Seed Messages
  initialMessages: {
    "user_1791396467957": [
      { id: "m1", senderId: "user_1791396467957", text: "Chào bạn! Mình kết nối trên SEE LAD nhé! 🔥", time: "10:30", status: "read" },
      { id: "m2", senderId: "user_1791395608431", text: "Chào Kiệt! Giao diện mới cập nhật xịn sò lắm.", time: "10:32", status: "read" }
    ]
  }
};
