from __future__ import annotations

from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, Any, Optional, List, Literal, Union


class ImageMeta(BaseModel):
    """图片元数据（blob 存储格式）"""
    id: str  # 例如: "sha256:abc123..."
    url: str  # 例如: "/media/abc123..."
    mime: str  # 例如: "image/png"

    model_config = ConfigDict(extra='allow')  # 容错其他字段


class RewardItem(BaseModel):
    """奖励项目"""
    name: str = ""
    image: Union[ImageMeta, str, Dict[str, Any]] = ""  # 支持 ImageMeta、路径字符串、或其他格式
    desc: str = ""

    model_config = ConfigDict(extra='allow')  # 容错额外字段（如 _row、_img_col 等）


class Section(BaseModel):
    """分段（规则或奖励分组）"""
    title: str = ""
    content: str = ""
    rewards: List[RewardItem] = Field(default_factory=list)

    model_config = ConfigDict(extra='allow')


class Block(BaseModel):
    """块（按 TITLE 分组的内容块，包含规则或奖励）"""
    block_title: str
    block_type: Literal["rules", "rewards"] = "rules"  # 默认为规则
    sections: List[Section] = Field(default_factory=list)

    model_config = ConfigDict(extra='allow')  # 容错大小写或其他变体


class Page(BaseModel):
    """页面"""
    region: str
    # 兼容两种结构：新的 blocks 或旧的 sections
    blocks: List[Block] = Field(default_factory=list)
    sections: List[Section] = Field(default_factory=list)

    model_config = ConfigDict(extra='allow')


class ParsedData(BaseModel):
    """解析后的完整数据"""
    pages: List[Page] = Field(default_factory=list)

    model_config = ConfigDict(extra='allow')


class ParseResult(BaseModel):
    """API 返回结果"""
    ok: bool = True
    result: Dict[str, Any]  # 保留为 Dict，因为前端直接返回字典，避免校验失败
    images: Dict[str, str] = Field(default_factory=dict)
    error: Optional[str] = None

    model_config = ConfigDict(extra='allow')

