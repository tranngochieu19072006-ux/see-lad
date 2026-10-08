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
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80",
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

  // Friends & Contacts List
  contacts: [
    {
      id: "user_nam",
      name: "Nguyễn Hoàng Nam",
      username: "@nam_tech",
      avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80",
      status: "online",
      statusText: "Đang code giao diện See Lad",
      unread: 1,
      location: {
        lat: 10.7820,
        lng: 106.6950,
        distance: "1.2 km",
        name: "Quận 3, TP.HCM"
      },
      chatTheme: "theme-cyber-indigo",
      inviteCode: "NAM-SEELAD-889"
    },
    {
      id: "user_nhi",
      name: "Lê Thảo Nhi",
      username: "@thaonhi_design",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80",
      status: "busy",
      statusText: "Đang họp review UX/UI 🎨",
      unread: 0,
      location: {
        lat: 10.7650,
        lng: 106.6820,
        distance: "2.8 km",
        name: "Quận 5, TP.HCM"
      },
      chatTheme: "theme-sunset-blaze",
      inviteCode: "NHI-DESIGN-772"
    },
    {
      id: "user_quan",
      name: "Phạm Minh Quân",
      username: "@quan_mobile",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80",
      status: "offline",
      statusText: "Offline - Hẹn gặp sau nhé",
      unread: 0,
      location: {
        lat: 10.8010,
        lng: 106.7110,
        distance: "4.5 km",
        name: "Bình Thạnh, TP.HCM"
      },
      chatTheme: "theme-midnight-neon",
      inviteCode: "QUAN-DEV-334"
    },
    {
      id: "group_core",
      name: "Team Dự Án SEE LAD 🚀",
      isGroup: true,
      avatar: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=300&q=80",
      membersCount: 4,
      members: ["user_hieu", "user_nam", "user_nhi", "user_quan"],
      unread: 3,
      chatTheme: "theme-cyber-indigo",
      inviteCode: "SEELAD-CORE-2026"
    }
  ],

  // Initial Seed Messages
  initialMessages: {
    "user_nam": [
      { id: "m1", senderId: "user_nam", text: "Chào Hiếu! Giao diện See Lad mới đỉnh thật sự 🔥", time: "10:30", status: "read" },
      { id: "m2", senderId: "user_hieu", text: "Cảm ơn Nam nhé! Vừa bổ sung xong tính năng radar vị trí và gọi video 60fps đó.", time: "10:32", status: "read" },
      { id: "m3", senderId: "user_nam", text: "Quá tuyệt! Tí test thử cuộc gọi video với radar nhé!", time: "10:35", status: "read" }
    ],
    "user_nhi": [
      { id: "n1", senderId: "user_nhi", text: "Hiếu ơi, bộ icon màu sắc và chế độ Dark/Light chuyển mượt lắm đó!", time: "09:15", status: "read" },
      { id: "n2", senderId: "user_hieu", text: "Ừ Nhi, mình dùng CSS variables chuyển êm ái 400ms không bị giật mắt.", time: "09:20", status: "read" }
    ],
    "user_quan": [
      { id: "q1", senderId: "user_quan", text: "Hôm nay mình đang bận việc xíu, có gì nhắn qua See Lad mình nhận sau nha.", time: "Hôm qua", status: "read" }
    ],
    "group_core": [
      { id: "g1", senderId: "user_nam", text: "Mọi người đã cập nhật bản SEE LAD mới nhất chưa?", time: "11:00", senderName: "Nguyễn Hoàng Nam" },
      { id: "g2", senderId: "user_nhi", text: "Đã update và test rất mượt trên cả điện thoại lẫn web!", time: "11:02", senderName: "Lê Thảo Nhi" },
      { id: "g3", senderId: "user_hieu", text: "Mọi người nhớ dùng thử bộ tạo mã QR cá nhân hóa và gửi file không giới hạn nhé!", time: "11:05", senderName: "Trần Ngọc Hiếu", isPinned: true }
    ]
  }
};
