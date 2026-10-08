import sqlite3

conn = sqlite3.connect('seelad.db')
c = conn.cursor()

# Remove mock bots
c.execute("DELETE FROM users WHERE id IN ('user_nam', 'user_nhi', 'user_quan')")
c.execute("DELETE FROM friendships WHERE user1_id IN ('user_nam', 'user_nhi', 'user_quan') OR user2_id IN ('user_nam', 'user_nhi', 'user_quan')")
c.execute("DELETE FROM messages WHERE sender_id IN ('user_nam', 'user_nhi', 'user_quan') OR receiver_id IN ('user_nam', 'user_nhi', 'user_quan')")
c.execute("DELETE FROM group_members WHERE user_id IN ('user_nam', 'user_nhi', 'user_quan')")

# Ensure user_hieu and user_1791394593572 (miku) are friends
c.execute("SELECT id FROM users WHERE username = 'miku'")
miku_row = c.fetchone()
if miku_row:
    miku_id = miku_row[0]
    c.execute("INSERT OR IGNORE INTO friendships (user1_id, user2_id, status) VALUES ('user_hieu', ?, 'accepted')", (miku_id,))
    c.execute("INSERT OR IGNORE INTO friendships (user1_id, user2_id, status) VALUES (?, 'user_hieu', 'accepted')", (miku_id,))

conn.commit()

c.execute("SELECT id, username FROM users")
print("Remaining users:", c.fetchall())
conn.close()
