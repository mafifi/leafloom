use std::io::{Cursor,Read,Write};
const MAX_INPUT:u64=20_000_000;
const ABI:&[u8]=b"LEAFLOOM_PIPE_CODEC_V1\0";

fn decode(bytes:&[u8])->Result<Vec<u8>,String>{
    if bytes.len() as u64>MAX_INPUT{return Err("INVALID".into());}
    let (width,height)=image::ImageReader::with_format(Cursor::new(bytes),image::ImageFormat::WebP).into_dimensions().map_err(|_|"INVALID")?;
    if width==0||height==0||width>8192||height>8192||u64::from(width)*u64::from(height)>16_000_000{return Err("INVALID".into());}
    let mut limits=image::Limits::default();limits.max_image_width=Some(8192);limits.max_image_height=Some(8192);limits.max_alloc=Some(128_000_000);
    let mut reader=image::ImageReader::with_format(Cursor::new(bytes),image::ImageFormat::WebP);reader.limits(limits);
    let rgba=reader.decode().map_err(|_|"INVALID")?.into_rgba8();
    if rgba.width()!=width||rgba.height()!=height{return Err("INVALID".into());}
    let mut output=Vec::with_capacity(ABI.len()+8+rgba.as_raw().len());output.extend(ABI);output.extend(width.to_le_bytes());output.extend(height.to_le_bytes());output.extend(rgba.into_raw());Ok(output)
}

/// A pipe-only helper exits before Tauri or AppKit starts. It has no file arguments.
pub fn run()->i32{
    // A killed Node host must not leave its pipe helper running on Unix.
    #[cfg(unix)]{let parent=unsafe{libc::getppid()};if parent<=1{return 2;}std::thread::spawn(move||loop{std::thread::sleep(std::time::Duration::from_millis(250));if unsafe{libc::getppid()}!=parent{std::process::exit(2);}});}
    let result=(||->Result<(),String>{
        let mut input=Vec::new();std::io::stdin().take(MAX_INPUT+1).read_to_end(&mut input).map_err(|_|"INVALID")?;
        let bytes=decode(&input)?;std::io::stdout().write_all(&bytes).map_err(|_|"INVALID")?;Ok(())
    })();
    if result.is_ok(){0}else{eprintln!("IMAGE_INVALID");2}
}

#[cfg(test)]mod tests{
 use super::*;
 #[test]fn actual_lossless_pixels_and_invalid_input(){
  use base64::Engine;let input=base64::engine::general_purpose::STANDARD.decode("UklGRi4AAABXRUJQVlA4TCEAAAAvAUAAEB8w/wKCIv9HExAU+T+agKDouuUCeGfCOkT0PwIA").unwrap();
  let decoded=decode(&input).unwrap();assert_eq!(&decoded[..ABI.len()],ABI);assert_eq!(&decoded[ABI.len()..ABI.len()+8],&[2,0,0,0,2,0,0,0]);assert_eq!(&decoded[ABI.len()+8..],&[255,0,0,255,0,255,0,128,0,0,255,255,0,0,0,0]);
  assert!(decode(b"not an image").is_err());assert!(decode(&input[..20]).is_err());
 }
}
