require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306');
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'edu_archive';

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true,
});

async function initDB() {
  // Ensure database exists before creating tables
  const tempConn = await mysql.createConnection({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
  });
  try {
    await tempConn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`[DB] Database '${DB_NAME}' ensured`);
  } finally {
    await tempConn.end();
  }

  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        real_name VARCHAR(50) NOT NULL DEFAULT '',
        role ENUM('admin','user') NOT NULL DEFAULT 'user',
        department VARCHAR(100) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doc_no VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        send_unit VARCHAR(255) NOT NULL DEFAULT '',
        receive_date DATE NOT NULL,
        status ENUM('pending','processing','completed') NOT NULL DEFAULT 'pending',
        implement_html TEXT,
        attachment_name VARCHAR(255),
        attachment_path VARCHAR(255),
        attachment_size INT,
        created_by VARCHAR(50) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_doc_status (status),
        INDEX idx_doc_title (title),
        INDEX idx_doc_docno (doc_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Migration: add attachments_json column for multi-file support
    try {
      const [cols] = await conn.execute("SHOW COLUMNS FROM documents LIKE 'attachments_json'");
      if (cols.length === 0) {
        await conn.execute("ALTER TABLE documents ADD COLUMN attachments_json JSON AFTER implement_html");
        const [docs] = await conn.execute(
          "SELECT id, attachment_name, attachment_path, attachment_size FROM documents WHERE attachment_name IS NOT NULL AND attachment_name != ''"
        );
        for (const doc of docs) {
          const attachment = {
            name: doc.attachment_name,
            path: doc.attachment_path,
            size: doc.attachment_size,
            url: `/uploads/${doc.attachment_path}`
          };
          await conn.execute(
            "UPDATE documents SET attachments_json = ? WHERE id = ?",
            [JSON.stringify([attachment]), doc.id]
          );
        }
        console.log('[DB] Migrated documents attachments to JSON column');
      }
    } catch (e) {
      console.error('[DB] documents migration error:', e.message);
    }

    // Migration: add is_internal column for internal-only documents
    try {
      const [cols] = await conn.execute("SHOW COLUMNS FROM documents LIKE 'is_internal'");
      if (cols.length === 0) {
        await conn.execute("ALTER TABLE documents ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0 AFTER status");
        console.log('[DB] Added is_internal column to documents');
      }
    } catch (e) {
      console.error('[DB] is_internal migration error:', e.message);
    }


    await conn.execute(`
      CREATE TABLE IF NOT EXISTS field_works (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(100) NOT NULL DEFAULT '',
        title VARCHAR(255) NOT NULL,
        location VARCHAR(255) NOT NULL DEFAULT '',
        work_date DATE NOT NULL,
        participants VARCHAR(500) NOT NULL DEFAULT '',
        status ENUM('pending','processing','completed') NOT NULL DEFAULT 'completed',
        is_internal TINYINT(1) NOT NULL DEFAULT 0,
        linked_doc_id INT,
        description_html TEXT,
        conclusion_html TEXT,
        photos_json JSON,
        attachments_json JSON,
        created_by VARCHAR(50) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (linked_doc_id) REFERENCES documents(id) ON DELETE SET NULL,
        INDEX idx_fw_type (type),
        INDEX idx_fw_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS project_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        is_builtin TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS file_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        is_builtin TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        path VARCHAR(500) NOT NULL,
        size INT NOT NULL DEFAULT 0,
        is_internal TINYINT(1) NOT NULL DEFAULT 0,
        uploaded_by VARCHAR(50) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES file_categories(id) ON DELETE CASCADE,
        INDEX idx_uf_category (category_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_name VARCHAR(50) NOT NULL DEFAULT '',
        action VARCHAR(50) NOT NULL DEFAULT '',
        module VARCHAR(50) NOT NULL DEFAULT '',
        target VARCHAR(255) NOT NULL DEFAULT '',
        ip VARCHAR(50) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_logs_module (module),
        INDEX idx_logs_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Migration: add is_internal column for field_works
    try {
      const [cols] = await conn.execute("SHOW COLUMNS FROM field_works LIKE 'is_internal'");
      if (cols.length === 0) {
        await conn.execute("ALTER TABLE field_works ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0 AFTER status");
        console.log('[DB] Added is_internal column to field_works');
      }
    } catch (e) {
      console.error('[DB] field_works is_internal migration error:', e.message);
    }

    // Migration: add is_internal column for uploaded_files
    try {
      const [cols] = await conn.execute("SHOW COLUMNS FROM uploaded_files LIKE 'is_internal'");
      if (cols.length === 0) {
        await conn.execute("ALTER TABLE uploaded_files ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0 AFTER size");
        console.log('[DB] Added is_internal column to uploaded_files');
      }
    } catch (e) {
      console.error('[DB] uploaded_files is_internal migration error:', e.message);
    }
    await seedData(conn);
    console.log('[DB] MySQL tables initialized');
  } finally {
    conn.release();
  }
}

async function seedData(conn) {
  const [rows] = await conn.execute('SELECT COUNT(*) as c FROM users');
  if (rows[0].c === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await conn.execute(
      'INSERT INTO users (username, password, real_name, role, department) VALUES (?,?,?,?,?), (?,?,?,?,?), (?,?,?,?,?), (?,?,?,?,?)',
      ['admin', hash, '系统管理员', 'admin', '办公室',
       'user01', bcrypt.hashSync('user123', 10), '李明华', 'user', '基础教育股',
       'user02', bcrypt.hashSync('user123', 10), '王晓燕', 'user', '安全监督股',
       'user03', bcrypt.hashSync('user123', 10), '张志远', 'user', '人事股']
    );
    console.log('[DB] Seeded 4 users');
  }

  const [docRows] = await conn.execute('SELECT COUNT(*) as c FROM documents');
  if (docRows[0].c === 0) {
    const docs = [
      ['教发〔2026〕12号', '关于开展学校食堂食品安全专项检查的通知', '省教育厅', '2026-04-28', 'pending', '拟于5月上旬联合市场监管局对全市中小学食堂进行专项检查。已制定检查方案，将分三组赴各县区学校实地检查。', '食堂安全检查方案.pdf', 2411724, '李明华'],
      ['教发〔2026〕11号', '关于做好2026年义务教育均衡发展督导评估工作的通知', '省教育厅', '2026-04-25', 'processing', '已组织督导组对全市20所义务教育学校开展评估走访。已完成15所，余下5所计划5月中旬前完成。', null, null, '王晓燕'],
      ['教基〔2026〕09号', '关于组织全市中小学体育工作专项督导的通知', '教育部', '2026-04-22', 'completed', '已完成对15所学校的体育工作督导，问题已反馈各校整改。整改率85%。', '体育督导报告.xlsx', 1887436, '李明华'],
      ['教安〔2026〕07号', '关于加强校园消防安全工作的紧急通知', '市教育局', '2026-04-20', 'completed', '已联合消防支队对32所中小学开展消防安全检查，整改隐患18处。', null, null, '王晓燕'],
      ['教发〔2026〕10号', '关于召开2026年度教育工作会议的通知', '省教育厅', '2026-04-18', 'completed', '会议已于4月28日顺利召开，全市教育局负责人参会。', '会议纪要.docx', 524288, '系统管理员'],
      ['教人〔2026〕05号', '关于开展教师资格定期注册工作的通知', '省教育厅', '2026-04-15', 'pending', '通知已转发至各校，正在收集教师材料。', null, null, '李明华'],
      ['教计〔2026〕03号', '关于下达2026年教育经费预算的通知', '省教育厅', '2026-04-10', 'completed', '预算已下达至各县区教育局，按序时进度拨付。', '预算分配表.pdf', 3250585, '系统管理员'],
      ['教研〔2026〕02号', '关于开展课堂教学质量监测的通知', '省教研室', '2026-04-08', 'processing', '已完成第一次监测，正在分析数据。', null, null, '王晓燕'],
    ];
    for (const d of docs) {
      await conn.execute(
        'INSERT INTO documents (doc_no, title, send_unit, receive_date, status, implement_html, attachment_name, attachment_size, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
        d
      );
    }
    console.log('[DB] Seeded 8 documents');
  }

  const [fwRows] = await conn.execute('SELECT COUNT(*) as c FROM field_works');
  if (fwRows[0].c === 0) {
    // Get actual document IDs for linking
    const [docs] = await conn.execute('SELECT id, doc_no FROM documents ORDER BY id LIMIT 3');
    const doc1Id = docs[0]?.id || null;
    const doc2Id = docs[1]?.id || null;

    const works = [
      ['下乡检查', '城区第一中学食堂食品安全检查', '城区第一中学', '2026-05-02', '李明华、王建国', 'completed', doc1Id, '联合市场监管局对城区第一中学食堂进行专项检查。检查组实地查看了食堂操作间、食材储存间、食品留样柜及工作人员健康证明等。经检查，食堂整体卫生状况良好，食品采购票据齐全。', '总体情况良好，符合食品安全标准。发现2处隐患：①冰柜生熟混放，已现场整改；②部分食品留样重量不足40克，已要求按标准整改。整改期限5月10日前完成。', '李明华'],
      ['下乡检查', '乐平镇中心小学食堂安全检查', '乐平镇中心小学', '2026-05-03', '李明华', 'completed', doc1Id, '对乐平镇中心小学食堂进行了实地检查。', '操作规范，建议加强食品添加剂管理。', '李明华'],
      ['督导评估', '均衡发展督导（城区组）', '城区各学校', '2026-04-28', '王晓燕', 'completed', doc2Id, '走访城区10所中小学，对办学条件、师资配备、课程设置等进行全面评估。', '各校硬件达标，软件资料需进一步完善。', '王晓燕'],
      ['组织会议', '高中招生工作部署会议', '市教育局会议室', '2026-04-25', '系统管理员、王建国', 'completed', null, '部署2026年高中招生工作安排。', '已下发招生工作方案。', '系统管理员'],
      ['工作落实', '农村教学点办学条件核查', '各乡镇教学点', '2026-04-22', '王晓燕', 'processing', null, '核查各乡镇教学点办学条件。', '核查中。', '王晓燕'],
      ['下乡检查', '春季校园消防安全联合检查', '城区直属学校', '2026-04-20', '王建国、李明华', 'completed', null, '联合消防部门对城区10所学校开展消防安全检查。', '整改隐患18处，下发整改通知书5份。', '王建国'],
    ];
    if (doc1Id) {
      for (const w of works) {
        await conn.execute(
          'INSERT INTO field_works (type, title, location, work_date, participants, status, linked_doc_id, description_html, conclusion_html, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
          w
        );
      }
      console.log('[DB] Seeded 6 field works');
    } else {
      console.log('[DB] Skipped field works seed - no documents exist');
    }
  }

  const [ptRows] = await conn.execute('SELECT COUNT(*) as c FROM project_types');
  if (ptRows[0].c === 0) {
    await conn.execute(
      'INSERT INTO project_types (name, is_builtin) VALUES (?,1), (?,1), (?,1), (?,1), (?,1), (?,0)',
      ['下乡检查', '组织会议', '工作落实', '督导评估', '收文落实', '专项调研']
    );
    console.log('[DB] Seeded 6 project types');
  }

  const [fcRows] = await conn.execute('SELECT COUNT(*) as c FROM file_categories');
  if (fcRows[0].c === 0) {
    await conn.execute(
      'INSERT INTO file_categories (name, is_builtin) VALUES (?,1), (?,1), (?,1), (?,1)',
      ['规章制度', '通知文件', '报告材料', '其他资料']
    );
    console.log('[DB] Seeded 4 file categories');
  }

  const [logRows] = await conn.execute('SELECT COUNT(*) as c FROM logs');
  if (logRows[0].c === 0) {
    const logs = [
      ['李明华', '新增', '收文落实', '教发〔2026〕12号', '192.168.1.101'],
      ['王晓燕', '编辑', '收文落实', '教发〔2026〕11号', '192.168.1.102'],
      ['系统管理员', '新增', '现场工作', '城区第一中学食堂安全检查', '192.168.1.100'],
      ['李明华', '导出PDF', '现场工作', '城区第一中学食堂安全检查', '192.168.1.101'],
      ['王晓燕', '新增', '现场工作', '均衡发展督导（城区组）', '192.168.1.102'],
      ['系统管理员', '删除', '用户管理', 'user04', '192.168.1.100'],
      ['李明华', '登录', '用户管理', '—', '192.168.1.101'],
    ];
    for (const l of logs) {
      await conn.execute(
        'INSERT INTO logs (user_name, action, module, target, ip) VALUES (?,?,?,?,?)',
        l
      );
    }
    console.log('[DB] Seeded 7 logs');
  }
}

async function addLog(userName, action, module, target, ip) {
  await pool.query(
    'INSERT INTO logs (user_name, action, module, target, ip) VALUES (?, ?, ?, ?, ?)',
    [userName, action, module, target, ip]
  );
}

module.exports = { pool, initDB, addLog };
