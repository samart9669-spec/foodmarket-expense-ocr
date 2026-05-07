import io

from PIL import Image


def images_to_pdf(image_bytes_list: list) -> bytes:
    images = [Image.open(io.BytesIO(b)).convert("RGB") for b in image_bytes_list]
    if not images:
        raise ValueError("No images provided")
    buf = io.BytesIO()
    images[0].save(buf, format="PDF", save_all=True, append_images=images[1:])
    return buf.getvalue()


def merge_slip_and_attachment(slip_bytes: bytes, attachment_bytes: bytes, attachment_name: str):
    """รวม slip + เอกสารแนบเป็น PDF ไฟล์เดียว"""
    ext = attachment_name.rsplit(".", 1)[-1].lower()
    if ext in ("jpg", "jpeg", "png", "webp"):
        return images_to_pdf([slip_bytes, attachment_bytes]), "merged_document.pdf"
    try:
        from pypdf import PdfReader, PdfWriter
        slip_pdf = images_to_pdf([slip_bytes])
        writer = PdfWriter()
        for raw in (slip_pdf, attachment_bytes):
            for page in PdfReader(io.BytesIO(raw)).pages:
                writer.add_page(page)
        buf = io.BytesIO()
        writer.write(buf)
        return buf.getvalue(), "merged_document.pdf"
    except ImportError:
        return images_to_pdf([slip_bytes]), "slip.pdf"
